// Contextual coding and calculated similarities remain separate, inspectable records.
const BASIS = {
  retrospective_account: 'Reported exchange', later_literature: 'Later reading',
  hypothetical_example: 'Hypothetical example', published_argument: 'Published argument',
};
const WORDS = value => String(value || '').replaceAll('_', ' ');
let mountId = 0;
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function button(text, className, action) {
  const node = el('button', className, text);
  node.type = 'button'; node.addEventListener('click', action); return node;
}
function head(title, description) {
  const node = el('header', 'ct-heading');
  node.append(el('h3', '', title), el('p', '', description)); return node;
}
function labelSelect(label, id) {
  const wrap = el('label', 'ct-control', label);
  const select = el('select'); select.id = id; wrap.htmlFor = id;
  wrap.append(select); return {wrap, select};
}
function option(label, value) {
  const node = el('option', '', label); node.value = value; return node;
}
function paragraphLinks(ids, callbacks) {
  const links = el('div', 'ct-source-links');
  for (const id of [...new Set(ids || [])]) links.append(button('Read '+id, '', () => callbacks.openParagraph(id)));
  return links;
}
function matrixWrap(label) {
  const wrap = el('div', 'ct-table-scroll'); wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', label);
  return wrap;
}
function cleanLabel(value) {
  const text = WORDS(value); return text ? text[0].toUpperCase()+text.slice(1) : '';
}

export function mountContextual(container, report, data, callbacks) {
  if (!container) return;
  container.replaceChildren(); container.classList.add('edition-context');
  const context = report?.contextual;
  if (context?.records?.length && context?.codebook?.length) {
    mountConcepts(container, context, callbacks);
  } else {
    container.append(el('p', 'ct-note', 'Contextual interpretations have not been supplied for this edition.'));
  }
}

export function mountPassageComparisons(container, report, data, callbacks) {
  if (!container) return;
  container.replaceChildren(); container.classList.add('edition-context');
  if (report?.lexical_returns?.matrix?.block_ids?.length > 1) {
    mountSimilarity(container, report.lexical_returns.matrix, data, callbacks, report.lexical_returns.options);
  }
}

// Use the same body-order and score rules as the Python lexical retrieval.
// Every pair is taken once from the symmetric matrix; no direction is inferred.
export function selectLexicalLinks(matrix, blocks, options = {}, limit = Infinity) {
  const body = blocks.filter(block => !block.is_reference && block.kind !== 'heading');
  const positions = new Map(body.map((block, index) => [block.id, index]));
  const distance = options.min_body_index_distance ?? 3;
  const minimum = options.minimum_cosine ?? 0.1;
  const links = [];
  for (let i = 0; i < matrix.block_ids.length; i++) {
    for (let j = i + 1; j < matrix.block_ids.length; j++) {
      const first = matrix.block_ids[i], second = matrix.block_ids[j];
      if (!positions.has(first) || !positions.has(second)) continue;
      const gap = Math.abs(positions.get(second) - positions.get(first));
      const score = Number(matrix.values[i]?.[j]);
      if (gap < distance || !Number.isFinite(score) || score < minimum) continue;
      links.push({i, j, earlier_id: first, later_id: second, score, body_index_distance: gap});
    }
  }
  links.sort((a, b) => b.score - a.score || a.earlier_id.localeCompare(b.earlier_id) || a.later_id.localeCompare(b.later_id));
  return links.slice(0, Math.max(0, limit));
}

function mountConcepts(container, context, callbacks) {
  const section = el('section', 'ct-concepts');
  section.append(head('Concepts in context', 'Explore how a passage uses an idea. The same word can concern a learner, an AI system, or the judgment an assessment asks us to make. These selected interpretations are grouped by their place in the essay.'));
  const coverage = context.coverage || {};
  section.append(el('p', 'ct-note', `${coverage.classified_blocks ?? 'Selected'} of ${coverage.body_blocks ?? 'the'} body passages carry contextual coding. A passage can receive several codes. Colour counts coded passages; it does not indicate a level of understanding.`));
  const concepts = new Map(context.codebook.map(item => [item.id, item]));
  const sections = new Map(context.sections.map(item => [item.id, item]));
  const cells = new Map(context.cells.map(item => [`${item.concept_id}|${item.section_id}`, item]));
  const max = Math.max(1, ...context.cells.map(item => item.count));
  const wrap = matrixWrap('Contextual concepts by article section. Scroll horizontally for all sections.');
  const table = el('table', 'ct-concept-table');
  table.append(el('caption', 'only-sr', 'Counts of distinct passages with a selected contextual code. A dash means no passage has been coded in this selection.'));
  const thead = el('thead'), top = el('tr'), first = el('th', '', 'Use of the concept');
  first.scope = 'col'; top.append(first);
  for (const item of context.sections) {
    const th = el('th'); th.scope = 'col'; th.title = item.label;
    th.append(el('span', 'ct-section-id', item.id), el('span', 'ct-section-size', `${item.total_body_blocks} passages`));
    th.setAttribute('aria-label', `${item.id}: ${item.label}; ${item.total_body_blocks} body passages`);
    top.append(th);
  }
  thead.append(top);
  const tbody = el('tbody');
  const status = el('p', 'ct-note ct-selection-status'); status.setAttribute('role', 'status');
  const detail = el('section', 'ct-concept-detail'); detail.setAttribute('aria-label', 'Selected contextual interpretations');
  let selected = context.cells.find(item => item.count > 0);
  function choose(cell) {
    selected = cell;
    for (const choice of tbody.querySelectorAll('button')) choice.setAttribute('aria-pressed', String(choice.dataset.cell === `${cell.concept_id}|${cell.section_id}`));
    const concept = concepts.get(cell.concept_id), sectionInfo = sections.get(cell.section_id);
    const ids = new Set(cell.block_ids);
    const matches = context.records.filter(item => item.concept_id === cell.concept_id && ids.has(item.block_id));
    status.textContent = `${concept.label} · ${sectionInfo.label} · ${cell.count} coded ${cell.count === 1 ? 'passage' : 'passages'}`;
    detail.replaceChildren(el('p', 'ct-kicker', `${sectionInfo.id} · ${sectionInfo.label}`), el('h4', '', concept.label), el('p', '', concept.definition));
    for (const record of matches) {
      const item = el('article', 'ct-context-record');
      item.append(el('p', 'ct-kicker', `${record.block_id} · ${cleanLabel(record.review_status)}`));
      const meta = el('dl', 'ct-context-meta');
      for (const [label, value] of [['Subject', record.subject_label || record.subject], ['Use in this passage', record.mode_label || record.mode]]) {
        const pair = el('div'); pair.append(el('dt', '', label), el('dd', '', cleanLabel(value))); meta.append(pair);
      }
      item.append(meta, el('blockquote', '', record.evidence.quote), el('p', '', record.interpretation), paragraphLinks([record.block_id], callbacks));
      detail.append(item);
    }
  }
  for (const concept of context.codebook) {
    const row = el('tr'), th = el('th', '', concept.label); th.scope = 'row'; row.append(th);
    for (const item of context.sections) {
      const td = el('td'); const key = `${concept.id}|${item.id}`; const cell = cells.get(key);
      if (cell?.count) {
        const b = button(cell.count, 'ct-heat-cell', () => choose(cell));
        b.dataset.cell = key; b.style.setProperty('--ct-weight', String(cell.count/max));
        b.setAttribute('aria-label', `${concept.label}; ${item.label}: ${cell.count} coded ${cell.count===1?'passage':'passages'}. Inspect evidence.`);
        b.setAttribute('aria-pressed', 'false'); td.append(b);
      } else {
        const empty = el('span', 'ct-empty', '—'); empty.setAttribute('aria-label', 'No passage coded in this selection'); td.append(empty);
      }
      row.append(td);
    }
    tbody.append(row);
  }
  table.append(thead, tbody); wrap.append(table);
  const legend = el('div', 'ct-heat-legend');
  legend.append(el('span', '', 'Fewer coded passages'), el('i'), el('span', '', 'More coded passages'));
  const sectionKey = el('details', 'ct-method');
  sectionKey.append(el('summary', '', 'Article sections and denominators'));
  const list = el('dl', 'ct-section-key');
  for (const item of context.sections) {
    const row = el('div'); row.append(el('dt', '', item.id), el('dd', '', `${item.label} · ${item.total_body_blocks} body passages`)); list.append(row);
  }
  sectionKey.append(list, el('p', 'ct-note', 'Section lengths differ. The table shows counts within this selected coding, not a complete measure of a concept’s prevalence.'));
  const method = el('details', 'ct-method'); method.append(el('summary', '', 'How these contextual interpretations were produced'));
  method.append(el('p', '', context.method), el('p', 'ct-note', context.limitation));
  section.append(wrap, legend, sectionKey, status, detail, method); container.append(section);
  if (selected) choose(selected);
}

function mountSimilarity(container, matrix, data, callbacks, options = {}) {
  const ids = matrix.block_ids, values = matrix.values, n = ids.length;
  const blocks = new Map((data.article?.blocks || []).map(item => [item.id, item]));
  const section = el('section', 'ct-similarity');
  section.append(head('Where passages resemble one another', 'Compare the vocabulary of passages across the essay. Each square in the matrix compares two passages. Select a pair to read its source text, then continue to the connections diagram below.'));
  const eligibility = options.min_paragraph_words ? `eligible passages (at least ${options.min_paragraph_words} words)` : 'eligible passages';
  section.append(el('p', 'ct-note', `${matrix.metric} · ${n} ${eligibility} · ${n*(n-1)/2} distinct pairs. Passages are arranged in publication order.`));
  const layout = el('div', 'ct-similarity-layout');
  const figure = el('figure', 'ct-similarity-figure');
  const axis = el('div', 'ct-matrix-axis'); axis.append(el('span', '', ids[0]), el('span', '', 'Passages in publication order'), el('span', '', ids[n-1]));
  const canvas = el('canvas', 'ct-similarity-canvas'); canvas.tabIndex = 0;
  canvas.setAttribute('role', 'group');
  canvas.setAttribute('aria-label', 'Passage similarity matrix. Use arrow keys to choose a pair. The same selections are available in the passage menus.');
  const hover = el('p', 'ct-hover', 'Select a square or use the passage menus.');
  const caption = el('figcaption', 'ct-note', matrix.note || 'Similarity concerns the words in the passages. It does not establish agreement, influence or learning.');
  const legend = el('div', 'ct-heat-legend ct-similarity-legend'); legend.append(el('span', '', '0 · Less similar'), el('i'), el('span', '', '1 · More similar'));
  figure.append(axis, canvas, hover, legend, caption);
  const uid = ++mountId;
  function comparisonPanel(suffix) {
    const detail = el('div', 'ct-pair-detail');
    const one = labelSelect('First passage', 'ct-first-'+uid+'-'+suffix), two = labelSelect('Compare with', 'ct-second-'+uid+'-'+suffix);
    ids.forEach((id,i)=>one.select.append(option(id,i)));
    const tools=el('div','ct-pair-controls');tools.append(one.wrap,two.wrap);
    const result=el('div','ct-pair-result');result.id='ct-comparison-result-'+uid+'-'+suffix;
    detail.append(tools,result);return {detail,one,two,result};
  }
  const panels=[comparisonPanel('matrix'),comparisonPanel('connections')];
  layout.append(figure,panels[0].detail);section.append(layout);
  const arcSection=el('section','ct-connections-section');
  arcSection.append(head('Connections across the essay', 'An arc joins passages with shared weighted vocabulary. Its span follows their distance in the published essay. Select a connection to read both passages alongside the diagram. The selection stays aligned with the matrix above.'));
  const arcLayout=el('div','ct-similarity-layout ct-connections-layout');
  const arcPanel=el('div','ct-arc-panel');
  arcLayout.append(arcPanel,panels[1].detail);arcSection.append(arcLayout);section.append(arcSection);
  const announcement=el('p','only-sr');announcement.setAttribute('role','status');section.append(announcement);
  container.append(section);
  let row = 0, col = 1;
  // Begin with a strong separated pair, retaining all pairs in the graphic.
  let best = -1;
  for (let i=0;i<n;i++) for (let j=i+3;j<n;j++) {
    if (Number(values[i]?.[j]) > best) {best = Number(values[i][j]);row=i;col=j;}
  }
  function score(i,j) {return Number(values[i]?.[j]) || 0;}
  function setSecondOptions(panel) {
    panel.two.select.replaceChildren();
    ids.forEach((id,i) => {if(i!==row)panel.two.select.append(option(id,i));});
    panel.two.select.value=String(col);
  }
  function draw() {
    const cssSize = canvas.getBoundingClientRect().width;
    if (!cssSize) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(cssSize * pixelRatio);
    canvas.width=size;canvas.height=size;
    const ctx=canvas.getContext('2d'); if(!ctx)return;
    const cell=size/n;
    ctx.fillStyle='#fafaf7';ctx.fillRect(0,0,size,size);
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){
      const value=Math.max(0,Math.min(1,score(i,j)));
      // Linear numeric scale; no percentile or semantic rescaling is applied.
      ctx.fillStyle=i===j?'#c8cbd1':`rgb(${Math.round(247-222*value)},${Math.round(248-190*value)},${Math.round(252-75*value)})`;
      ctx.fillRect(Math.floor(j*cell),Math.floor(i*cell),Math.ceil(cell),Math.ceil(cell));
    }
    ctx.strokeStyle='#0d162e';ctx.lineWidth=1.5*pixelRatio;
    ctx.strokeRect(col*cell,row*cell,cell,cell);
    ctx.strokeRect(row*cell,col*cell,cell,cell);
    ctx.strokeStyle='rgba(18,33,75,.45)';ctx.lineWidth=pixelRatio;
    ctx.beginPath();ctx.moveTo(0,(row+.5)*cell);ctx.lineTo(size,(row+.5)*cell);ctx.moveTo((col+.5)*cell,0);ctx.lineTo((col+.5)*cell,size);ctx.stroke();
  }
  let arcView;
  function update(i,j) {
    row=Math.max(0,Math.min(n-1,i));col=Math.max(0,Math.min(n-1,j));
    if(row===col)col=(row+1)%n;
    for(const panel of panels){
      panel.one.select.value=String(row);setSecondOptions(panel);
      panel.result.replaceChildren(el('p','ct-kicker','Selected comparison'),el('h4','',`${ids[row]} and ${ids[col]}`));
      const metric=el('p','ct-pair-score');metric.append(el('strong','',score(row,col).toFixed(3)),el('span','','Lexical similarity · 0–1'));panel.result.append(metric);
      for(const index of [row,col]){
        const block=blocks.get(ids[index]);const passage=el('section','ct-pair-passage');
        passage.append(el('h5','',ids[index]),el('p','ct-note',block?.section||''),el('p','',block?.text||'Passage unavailable.'),paragraphLinks([ids[index]],callbacks));panel.result.append(passage);
      }
    }
    announcement.textContent=`Both diagrams compare ${ids[row]} and ${ids[col]}, lexical similarity ${score(row,col).toFixed(3)}.`;
    hover.textContent=`Selected ${ids[row]} × ${ids[col]} · ${score(row,col).toFixed(3)}`;
    canvas.setAttribute('aria-label',`Passage similarity matrix. Selected ${ids[row]} and ${ids[col]}, score ${score(row,col).toFixed(3)}. Use arrow keys to move; self comparisons are skipped.`);
    draw();
    arcView?.select(row, col);
  }
  function fromPointer(event) {
    const rect=canvas.getBoundingClientRect();
    return [Math.min(n-1,Math.max(0,Math.floor((event.clientY-rect.top)/rect.height*n))),Math.min(n-1,Math.max(0,Math.floor((event.clientX-rect.left)/rect.width*n)))];
  }
  canvas.addEventListener('pointermove',event=>{const [i,j]=fromPointer(event);hover.textContent=i===j?`${ids[i]} · Self comparison omitted`:`${ids[i]} × ${ids[j]} · ${score(i,j).toFixed(3)}`;});
  canvas.addEventListener('pointerleave',()=>{hover.textContent=`Selected ${ids[row]} × ${ids[col]} · ${score(row,col).toFixed(3)}`;});
  canvas.addEventListener('click',event=>{const [i,j]=fromPointer(event);if(i!==j)update(i,j);});
  canvas.addEventListener('keydown',event=>{
    const delta={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]}[event.key];
    if(!delta)return;event.preventDefault();let i=row+delta[0],j=col+delta[1];
    if(i===j){i+=delta[0];j+=delta[1];}
    if(i>=0&&i<n&&j>=0&&j<n)update(i,j);
  });
  for(const panel of panels){
    panel.one.select.addEventListener('change',()=>update(Number(panel.one.select.value),col));
    panel.two.select.addEventListener('change',()=>update(row,Number(panel.two.select.value)));
  }
  if(window.ResizeObserver){const observer=new ResizeObserver(draw);observer.observe(canvas);}
  else window.addEventListener('resize',draw,{passive:true});
  arcView = mountLexicalConnections(arcPanel, matrix, data.article?.blocks || [], options, update, panels[1].result.id, uid);
  update(row,col);
}

function mountLexicalConnections(container, matrix, blocks, options, choose, resultId, uid) {
  const ids = matrix.block_ids;
  const candidates = selectLexicalLinks(matrix, blocks, options);
  const minimum = options.minimum_cosine ?? 0.1;
  const minDistance = options.min_body_index_distance ?? 3;
  const body = blocks.filter(block => !block.is_reference && block.kind !== 'heading');
  const positions = new Map(body.map((block, index) => [block.id, index]));
  const bodyStart = positions.get(ids[0]) || 0;
  const bodySpan = Math.max(1, (positions.get(ids.at(-1)) || 0) - bodyStart);
  const svgNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attributes = {}) {
    const element = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
  }
  const limitControl = labelSelect('Show the strongest matches', 'ct-arc-limit-'+uid);
  for (const count of [8, 18, 30]) limitControl.select.append(option('Up to '+count+' pairs', count));
  limitControl.select.value = '18';
  const controls = el('div', 'ct-arc-controls');
  const status = el('p', 'ct-note'); status.setAttribute('role', 'status');
  controls.append(limitControl.wrap, status); container.append(controls);
  const figure = el('figure', 'ct-arc-figure');
  const svg = svgEl('svg', {viewBox: '0 0 800 340', class: 'ct-arc-svg', role: 'group', 'aria-label': 'Undirected lexical connections in publication order'});
  const axis = el('div', 'ct-arc-axis');
  const axisPositions = [0, Math.round((ids.length-1)/3), Math.round(2*(ids.length-1)/3), ids.length-1];
  for (const i of axisPositions) {
    const label = el('span', '', ids[i]);
    label.style.left = (4 + 92*((positions.get(ids[i])-bodyStart)/bodySpan))+'%';
    axis.append(label);
  }
  const caption = el('figcaption', 'ct-note', 'Each mark is an eligible passage. Arc height reflects separation in article order, not the similarity score. The selected pair is blue; connections have no direction.');
  figure.append(svg, axis, caption);
  const selection = el('p', 'ct-arc-selection'); selection.setAttribute('role', 'status');
  const listDetails = el('details', 'ct-method ct-arc-list-details');
  const listSummary = el('summary'); const list = el('ol', 'ct-arc-pair-list');
  listDetails.append(listSummary, list);
  container.append(figure, selection, listDetails, el('p', 'ct-note', 'These are lexical retrieval links, not coded argumentative relationships. A match does not establish influence, agreement or a change in understanding.'));
  let shown = [], selectedKey = '', selectedI = -1, selectedJ = -1;
  const key = (i,j) => Math.min(i,j)+'|'+Math.max(i,j);
  function x(index) { return 32 + 736*((positions.get(ids[index])-bodyStart)/bodySpan); }
  function describe(link) { return `${link.earlier_id} and ${link.later_id} · ${link.score.toFixed(3)}`; }
  function showSelection() {
    for (const node of container.querySelectorAll('[data-pair]')) {
      const active = node.dataset.pair === selectedKey;
      node.classList.toggle('is-selected', active);
      if (node.getAttribute('role') === 'button' || node.tagName === 'BUTTON') node.setAttribute('aria-pressed', String(active));
    }
    for (const node of svg.querySelectorAll('[data-passage]')) {
      const index = Number(node.dataset.passage);
      node.classList.toggle('is-selected', index === selectedI || index === selectedJ);
    }
    if (selectedI < 0) return;
    const selected = shown.find(link => key(link.i,link.j) === selectedKey);
    selection.textContent = selected ? `Selected ${describe(selected)}` : `${ids[selectedI]} and ${ids[selectedJ]} are selected in the comparison. This pair is outside the ${shown.length} connections currently drawn.`;
  }
  function render() {
    shown = candidates.slice(0, Number(limitControl.select.value));
    status.textContent = `${shown.length} of ${candidates.length} qualifying pairs · similarity ≥ ${minimum.toFixed(3)} · at least ${Math.max(0,minDistance-1)} body passages between each pair.`;
    listSummary.textContent = `Read the ${shown.length} displayed comparisons`;
    svg.replaceChildren(); list.replaceChildren();
    // Long arcs are painted first, so short connections remain reachable.
    const ordered = [...shown].sort((a,b) => b.body_index_distance-a.body_index_distance || a.i-b.i);
    const rail = svgEl('path', {d:'M32 294 H768', class:'ct-arc-rail'}); svg.append(rail);
    for (const link of ordered) {
      const first = x(link.i), last = x(link.j), spread = last-first;
      const rise = Math.min(265, 27+spread*.38);
      const d = `M${first} 294 C${first} ${294-rise*1.3},${last} ${294-rise*1.3},${last} 294`;
      const group = svgEl('g', {class:'ct-arc-link', role:'button', tabindex:0, 'aria-label':`Compare ${describe(link)}. Body-order distance ${link.body_index_distance}.`, 'aria-controls':resultId, 'aria-pressed':'false'});
      group.dataset.pair=key(link.i,link.j);
      const title=svgEl('title');title.textContent=describe(link);group.append(title);
      group.append(svgEl('path',{d,class:'ct-arc-hit'}),svgEl('path',{d,class:'ct-arc-stroke'}));
      group.addEventListener('click',()=>choose(link.i,link.j));
      group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(link.i,link.j);}});
      svg.append(group);
    }
    const endpoints = new Set(shown.flatMap(link=>[link.i,link.j]));
    for(let index=0;index<ids.length;index++) {
      const line=svgEl('line',{x1:x(index),x2:x(index),y1:294,y2:endpoints.has(index)?310:302,class:'ct-arc-tick'});
      line.dataset.passage=String(index);svg.append(line);
      if(endpoints.has(index)) {
        const dot=svgEl('circle',{cx:x(index),cy:294,r:3.2,class:'ct-arc-dot'});dot.dataset.passage=String(index);svg.append(dot);
      }
    }
    shown.forEach((link,rank)=>{
      const item=el('li');const pick=button('', 'ct-arc-pair',()=>choose(link.i,link.j));
      pick.dataset.pair=key(link.i,link.j);pick.setAttribute('aria-controls',resultId);pick.setAttribute('aria-pressed','false');
      pick.setAttribute('aria-label',`Compare ${describe(link)}`);
      pick.append(el('span','ct-arc-rank',String(rank+1).padStart(2,'0')),el('span','ct-arc-ids',link.earlier_id+' · '+link.later_id),el('span','ct-arc-score',link.score.toFixed(3)));
      item.append(pick);list.append(item);
    });
    showSelection();
  }
  limitControl.select.addEventListener('change',render);render();
  return {select(i,j){selectedI=i;selectedJ=j;selectedKey=key(i,j);showSelection();}};
}

export function mountReasoningChanges(container, report, callbacks) {
  if(!container)return;
  container.replaceChildren();container.classList.add('edition-context');
  const episodes=report?.episodes||[];if(!episodes.length)return;
  const section=el('section','ct-reasoning');
  section.append(head('A conclusion and its reasons can change differently', 'Read the two dimensions together. Each cell counts selected episodes with the same proposed combination. Open a cell to examine the reasoning and the evidence behind its classification.'));
  const uid=++mountId,filter=labelSelect('Evidence basis','ct-change-basis-'+uid);
  filter.select.append(option('All evidence bases',''));
  for(const [id,label]of Object.entries(BASIS))if(episodes.some(e=>e.basis===id))filter.select.append(option(label,id));
  const tools=el('div','ct-change-tools'),status=el('p','ct-note');status.setAttribute('role','status');tools.append(filter.wrap,status);
  const columns=['elaborated','qualified','repaired','not_established'];
  const rows=['retained','revised','unresolved','not_established'];
  const wrap=matrixWrap('Conclusion state by justification change. Counts of selected episodes.');
  const table=el('table','ct-change-table');table.append(el('caption','only-sr','Rows describe the conclusion; columns describe the justification. Counts refer to selected, provisionally coded episodes.'));
  const thead=el('thead'),headRow=el('tr'),first=el('th','','Conclusion / justification');first.scope='col';headRow.append(first);
  for(const state of columns){const th=el('th','',cleanLabel(state));th.scope='col';headRow.append(th);}
  thead.append(headRow);const tbody=el('tbody');table.append(thead,tbody);wrap.append(table);
  const detail=el('section','ct-change-detail');detail.setAttribute('aria-label','Episodes in the selected reasoning-change cell');
  let selected='unresolved|elaborated';
  function show(key,visible){
    selected=key;const [conclusion,justification]=key.split('|');
    for(const b of tbody.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.cell===key));
    const matches=visible.filter(e=>e.change.conclusion===conclusion&&e.change.justification===justification);
    detail.replaceChildren(el('p','ct-kicker',`${cleanLabel(conclusion)} conclusion · ${cleanLabel(justification)} justification`));
    for(const episode of matches){
      const article=el('article','ct-change-episode');
      article.append(el('p','ct-kicker',`${episode.id} · ${BASIS[episode.basis]} · ${cleanLabel(episode.review_status)}`),el('h4','',episode.title),el('p','',episode.change.explanation));
      const question=el('p','ct-pedagogical');question.append(el('strong','','Question for theological pedagogy'),document.createTextNode(episode.pedagogical_question));article.append(question);
      article.append(paragraphLinks(episode.source_ids,callbacks));
      if(episode.node_ids?.length)article.append(button('Inspect the interpretations','ct-interpretations',()=>callbacks.openNodes(episode.node_ids)));
      detail.append(article);
    }
  }
  function render(){
    const visible=episodes.filter(e=>!filter.select.value||e.basis===filter.select.value);
    const hypothetical=visible.filter(e=>e.basis==='hypothetical_example').length;
    status.textContent=`${visible.length} selected ${visible.length===1?'episode':'episodes'}${hypothetical?`; ${hypothetical} hypothetical example${hypothetical>1?'s':''} included`:''}. Counts describe the coding, not a learning score.`;
    tbody.replaceChildren();const available=[];
    for(const conclusion of rows){
      const tr=el('tr'),label=el('th','',cleanLabel(conclusion));label.scope='row';tr.append(label);
      for(const justification of columns){
        const td=el('td'),key=conclusion+'|'+justification,count=visible.filter(e=>e.change.conclusion===conclusion&&e.change.justification===justification).length;
        if(count){available.push(key);const b=button(count,'ct-count-cell',()=>show(key,visible));b.dataset.cell=key;b.style.setProperty('--ct-weight',String(count/Math.max(1,visible.length)));b.setAttribute('aria-label',`${cleanLabel(conclusion)} conclusion, ${cleanLabel(justification)} justification: ${count} ${count===1?'episode':'episodes'}. Inspect evidence.`);b.setAttribute('aria-pressed','false');td.append(b);}
        else td.append(el('span','ct-empty','—'));
        tr.append(td);
      }
      tbody.append(tr);
    }
    if(available.length)show(available.includes(selected)?selected:available[0],visible);
    else detail.replaceChildren(el('p','','No episodes in this selection.'));
  }
  const note=el('p','ct-note','“Unresolved” describes a question left open. “Not established” means the record does not establish a change in that dimension. Empty cells mean no selected episode was assigned that combination.');
  section.append(tools,wrap,note,detail);container.append(section);filter.select.addEventListener('change',render);render();
}
