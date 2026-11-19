// Source-linked argument explorer. Geometry is a reading aid, never a learning score.
const SVG = 'http://www.w3.org/2000/svg';

const POSITIONS = {
  A01:[115,165], A04:[325,165], A05:[325,300], A06:[540,165],
  A08:[115,425], A10:[115,295], A18:[115,555], A20:[325,555],
  A21:[540,300], A25:[540,445],
  A07:[125,740], A16:[330,740], A22:[125,875], A23:[330,875], A24:[540,740],
  A02:[785,165], A03:[1000,165], A11:[785,325], A12:[1000,325],
  A13:[785,515], A14:[1000,490], A15:[1000,635], A17:[785,700], A19:[1000,805],
};

const SHORT = {
  A01:['Equivalent','assistance'], A02:['“My own','thinking”'],
  A03:['A useful','distinction'], A04:['A caution about','outsourcing'],
  A05:['The comparison','has changed'], A06:['Acknowledging','the mismatch'],
  A07:['The naturalism','question'], A08:['Feedback can','introduce ideas'],
  A09:['Learning through','feedback'], A10:['A suggestion','via a friend'],
  A11:['Explain and','defend the work'], A12:['Responsible','dependence'],
  A13:['Returning as','a reader'], A14:['Dialogue and','engagement'],
  A15:['Limits of','the archive'], A16:['Applying the','distinction'],
  A17:['Understanding','at a later time'], A18:['An open','comparison'],
  A19:['Reading came','later'], A20:['Correction is','not a score'],
  A21:['Agreement is','not proof'], A22:['A restriction','within method'],
  A23:['A claim about','all existence'], A24:['Challenge the','inference'],
  A25:['The qualification','returns'],
};

const GROUPS = {
  comparison: ['A01','A04','A05','A06','A08','A09','A10','A18','A20','A21','A25'],
  theology: ['A07','A16','A22','A23','A24'],
  understanding: ['A02','A03','A11','A12','A13','A14','A15','A17','A19'],
};

const TYPE_LABEL = {
  questions_relevance_of: 'questions relevance to', acknowledges: 'acknowledges',
  challenges: 'challenges', supports: 'supports', qualifies: 'qualifies',
  distinguishes: 'distinguishes', contextualises: 'contextualises',
  illustrates: 'illustrates', reframes: 'reframes', returns_to: 'returns to',
  develops_example: 'develops the example in',
};

const BASIS = {
  published_argument: 'Published argument', retrospective_account: 'Reported exchange',
  hypothetical_example: 'Hypothetical example', later_literature: 'Later reading',
};

function html(tag, attributes = {}, text = '') {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, String(value));
  if (text) el.textContent = text;
  return el;
}
function svg(tag, attributes = {}, text = '') {
  const el = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, String(value));
  if (text) el.textContent = text;
  return el;
}
function relationshipLabel(type) {
  return TYPE_LABEL[type] || String(type || 'related to').replaceAll('_', ' ');
}
function nodeColour(node) {
  if (node.record_basis === 'later_literature') return 'var(--map-source, #238c7c)';
  if (node.actor_as_reported === 'assistant') return 'var(--map-ai, #7e6dc8)';
  return 'var(--map-human, #b16a25)';
}
function edgePath(a, b, i) {
  const [x1, y1] = [a[0], a[1] - 13];
  const [x2, y2] = [b[0], b[1] - 13];
  const dx = x2 - x1, dy = y2 - y1;
  if (Math.abs(dx) < 55) {
    const side = x1 > 680 ? 1 : -1;
    const bend = side * (62 + (i % 3) * 15);
    return `M ${x1} ${y1} C ${x1+bend} ${y1+dy*.28} ${x2+bend} ${y2-dy*.28} ${x2} ${y2}`;
  }
  if (Math.abs(dy) < 50) {
    const bend = -47 - (i % 3) * 13;
    return `M ${x1} ${y1} C ${x1+dx*.3} ${y1+bend} ${x2-dx*.3} ${y2+bend} ${x2} ${y2}`;
  }
  return `M ${x1} ${y1} C ${x1+dx*.48} ${y1} ${x2-dx*.48} ${y2} ${x2} ${y2}`;
}

export function initExplorer(data) {
  const mount = document.querySelector('#relationship-map');
  const panel = document.querySelector('#evidence-panel');
  if (!mount || !panel) return;
  if (mount.dataset.ready) return;
  mount.dataset.ready = 'true';

  const nodes = data.nodes || [];
  const index = new Map(nodes.map(n => [n.id, n]));
  const blocks = new Map((data.article?.blocks || data.blocks || []).map(b => [b.id, b]));
  const relations = (data.relations || []).filter(r =>
    index.has(r.source) && index.has(r.target) && r.eligible_for_graph !== false && r.review_status !== 'rejected');
  if (!nodes.length) {
    mount.append(html('p', {}, 'No source-linked records are available.'));
    return;
  }
  let activeId = index.has('A05') ? 'A05' : nodes[0].id;
  let activeRelation = null;
  let showAll = false;
  let selectedGroup = 'all';
  const positions = {...POSITIONS, A09:[325,435]};
  let extra = 0;
  for (const node of nodes) {
    if (!positions[node.id]) positions[node.id] = [125+(extra%5)*210, 1010+Math.floor(extra++/5)*125];
  }
  const height = extra ? 1100 + Math.ceil(extra/5)*125 : 955;

  let controls = document.querySelector('#explorer-controls');
  if (!controls) {
    controls = html('div', {id:'explorer-controls'});
    mount.before(controls);
  }
  const toolbar = html('div', {class:'map-toolbar'});
  function selectControl(caption, id) {
    const label = html('label', {class:'map-select-label', for:id}, caption);
    const select = html('select', {id, class:'map-select'});
    label.append(select); toolbar.append(label); return select;
  }
  const nodeSelect = selectControl('Explore a passage', 'map-node-select');
  for (const node of nodes) nodeSelect.append(html('option', {value:node.id}, `${node.id} · ${node.label}`));
  nodeSelect.value = activeId;
  const relationSelect = selectControl('Inspect a relationship', 'map-relation-select');
  relationSelect.append(html('option', {value:''}, 'Choose a connection'));
  for (const r of relations) relationSelect.append(html('option', {value:r.id}, `${r.source} · ${relationshipLabel(r.type)} · ${r.target}`));
  const groupSelect = selectControl('Area of inquiry', 'map-group-select');
  for (const [value, label] of [['all','Whole inquiry'],['comparison','Assistance and the question'],['theology','The theological inference'],['understanding','Understanding over time']]) {
    groupSelect.append(html('option', {value}, label));
  }
  const allButton = html('button', {type:'button', class:'map-button', 'aria-pressed':'false'}, 'Show all connections');
  toolbar.append(allButton); controls.append(toolbar);

  const legend = html('div', {class:'map-legend', 'aria-label':'Contribution roles'});
  for (const [label, color] of [['Author','#b16a25'],['AI, as reported','#7e6dc8'],['Later scholarship','#238c7c']]) {
    const item = html('span', {class:'map-legend-item'});
    const dot = html('span', {class:'map-dot', 'aria-hidden':'true'});
    dot.style.background = color;
    item.append(dot, document.createTextNode(label)); legend.append(item);
  }
  controls.append(legend);
  const status = html('p', {class:'map-status', 'aria-live':'polite'});
  controls.append(status);

  const viewport = html('div', {class:'map-viewport', tabindex:'0', 'aria-label':'Scrollable relationship map'});
  const canvas = svg('svg', {viewBox:`0 0 1180 ${height}`, class:'map-svg', role:'group', 'aria-label':'Relationships in the article. Select a passage to inspect its evidence.'});
  const defs = svg('defs');
  const marker = svg('marker', {id:'map-arrow', viewBox:'0 0 10 10', refX:'9', refY:'5', markerWidth:'5', markerHeight:'5', orient:'auto-start-reverse'});
  marker.append(svg('path', {d:'M 0 0 L 10 5 L 0 10 Z', fill:'context-stroke'}));
  defs.append(marker); canvas.append(defs);
  for (const [x,y,label] of [[55,65,'ASSISTANCE & THE QUESTION'],[55,670,'THE THEOLOGICAL INFERENCE'],[700,65,'UNDERSTANDING OVER TIME']]) {
    const title = svg('text',{x,y,class:'map-cluster-label','font-size':'15',fill:'var(--ink-muted, #6b7b83)','letter-spacing':'1.4'},label);
    canvas.append(title);
  }
  canvas.append(svg('path',{d:'M 665 80 V 900 M 55 625 H 610',stroke:'var(--line, #dbe3e4)','stroke-width':'1.5',fill:'none'}));
  const edgeLayer = svg('g', {class:'map-edges'});
  const nodeLayer = svg('g', {class:'map-nodes'});
  canvas.append(edgeLayer, nodeLayer);
  viewport.append(canvas); mount.append(viewport);

  const edgeElements = new Map();
  for (const [i, r] of relations.entries()) {
    const g = svg('g', {'data-relation':r.id});
    const d = edgePath(positions[r.source], positions[r.target], i);
    const line = svg('path', {d, class:'map-edge', fill:'none', stroke:'var(--map-edge, #567981)', 'stroke-width':'3.5', 'marker-end':'url(#map-arrow)', 'stroke-linecap':'round', 'pointer-events':'none'});
    const hit = svg('path', {d, fill:'none', stroke:'transparent','stroke-width':'19',class:'map-edge-hit', 'aria-hidden':'true'});
    hit.style.cursor = 'pointer';
    hit.addEventListener('click', () => chooseRelation(r.id));
    g.append(line, hit, svg('title',{},`${index.get(r.source).label} ${relationshipLabel(r.type)} ${index.get(r.target).label}`));
    edgeLayer.append(g); edgeElements.set(r.id, {g,line,hit});
  }

  const nodeElements = new Map();
  for (const node of nodes) {
    const [x,y] = positions[node.id];
    const g = svg('g', {transform:`translate(${x},${y})`, class:'map-node', role:'button', tabindex:node.id===activeId?'0':'-1', 'aria-label':node.label, 'aria-pressed':'false', 'data-node':node.id});
    g.style.cursor = 'pointer';
    g.append(svg('rect',{x:-91,y:-38,width:182,height:100,rx:12,fill:'transparent'}));
    const ring = svg('circle',{cx:0,cy:-13,r:22,fill:nodeColour(node),opacity:0,class:'map-node-ring'});
    const circle = svg('circle',{cx:0,cy:-13,r:10,fill:nodeColour(node),stroke:'var(--paper, #fff)','stroke-width':3});
    g.append(ring,circle);
    const lines = SHORT[node.id] || [node.label.slice(0,20),node.label.slice(20,40)];
    const label = svg('text',{x:0,y:22,'text-anchor':'middle',class:'map-node-label',fill:'var(--ink, #172731)','font-size':20,'font-weight':500,'aria-hidden':'true'});
    lines.forEach((line,i)=> label.append(svg('tspan',{x:0,dy:i?23:0},line)));
    g.append(label,svg('title',{},node.label));
    g.addEventListener('click',()=>chooseNode(node.id));
    g.addEventListener('keydown',event=>{
      if (event.key==='Enter'||event.key===' ') { event.preventDefault(); chooseNode(node.id); }
      const delta={ArrowRight:[1,0],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowUp:[0,-1]}[event.key];
      if (!delta) return;
      event.preventDefault();
      const candidates=nodes.filter(n=>n.id!==node.id).map(n=>{
        const [nx,ny]=positions[n.id], dx=nx-x,dy=ny-y;
        return {id:n.id,forward:dx*delta[0]+dy*delta[1],perp:Math.abs(dx*delta[1]-dy*delta[0])};
      }).filter(n=>n.forward>0).sort((a,b)=>(a.forward+a.perp*2)-(b.forward+b.perp*2));
      if (candidates[0]) {chooseNode(candidates[0].id);nodeElements.get(candidates[0].id).g.focus({preventScroll:true});}
    });
    nodeLayer.append(g);nodeElements.set(node.id,{g,ring,circle});
  }

  function sourceContext(record) {
    const span=record.evidence?.spans?.[0];
    const block=span&&blocks.get(span.block_id);
    if (!block) return null;
    const details=html('details',{class:'evidence-context'});
    details.append(html('summary',{},'Read the surrounding passage'));
    details.append(html('p',{class:'evidence-meta'}, `${span.block_id} · ${block.section || 'Article'}`));
    details.append(html('p',{},block.text));
    return details;
  }
  function relationshipButton(r,otherId) {
    const button=html('button',{type:'button',class:'evidence-link'});
    button.append(html('span',{class:'evidence-link-type'},`${r.source===activeId?'Outgoing':'Incoming'} · ${relationshipLabel(r.type)}`));
    button.append(html('strong',{},index.get(otherId).label));
    button.addEventListener('click',()=>chooseRelation(r.id));
    return button;
  }
  function showNodeEvidence(node) {
    panel.replaceChildren();
    panel.append(html('p',{class:'evidence-eyebrow'},`${node.id} · ${BASIS[node.record_basis]||'Analytical record'}`));
    panel.append(html('h3',{class:'evidence-title'},node.label));
    panel.append(html('blockquote',{class:'evidence-quote'},node.anchor));
    panel.append(html('p',{class:'evidence-interpretation'},node.interpretation));
    panel.append(html('p',{class:'evidence-meta'},'Interpretive proposal · source passage located'));
    const context=sourceContext(node);if(context)panel.append(context);
    const connections=relations.filter(r=>r.source===node.id||r.target===node.id);
    if(connections.length){
      panel.append(html('p',{class:'evidence-label'},`${connections.length} connected ${connections.length===1?'passage':'passages'}`));
      const list=html('div',{class:'evidence-links'});
      for(const r of connections)list.append(relationshipButton(r,r.source===node.id?r.target:r.source));
      panel.append(list);
    }else{
      panel.append(html('p',{class:'evidence-note'},'This record provides context. No argumentative connection has been asserted in the current analysis.'));
    }
  }
  function showRelationEvidence(r) {
    panel.replaceChildren();
    panel.append(html('p',{class:'evidence-eyebrow'},`${r.id} · Relationship interpretation`));
    panel.append(html('h3',{class:'evidence-title'},relationshipLabel(r.type)));
    const route=html('div',{class:'evidence-relation'});
    const from=html('button',{type:'button',class:'evidence-link'},index.get(r.source).label);
    const to=html('button',{type:'button',class:'evidence-link'},index.get(r.target).label);
    from.addEventListener('click',()=>chooseNode(r.source));
    to.addEventListener('click',()=>chooseNode(r.target));
    route.append(from,html('span',{class:'evidence-meta'},relationshipLabel(r.type)),to);panel.append(route);
    panel.append(html('blockquote',{class:'evidence-quote'},r.anchor||'No passage attached.'));
    panel.append(html('p',{class:'evidence-interpretation'},r.rationale||''));
    panel.append(html('p',{class:'evidence-note'},'The arrow describes an interpreted relationship. It does not establish chronological order or a causal learning effect.'));
    const context=sourceContext(r);if(context)panel.append(context);
  }
  function updateMap() {
    const relation=activeRelation&&relations.find(r=>r.id===activeRelation);
    const focus=new Set();
    if(showAll&&selectedGroup==='all')nodes.forEach(n=>focus.add(n.id));
    else if(selectedGroup!=='all')(GROUPS[selectedGroup]||[]).forEach(id=>focus.add(id));
    else if(relation){focus.add(relation.source);focus.add(relation.target);}
    else{
      focus.add(activeId);
      relations.filter(r=>r.source===activeId||r.target===activeId).forEach(r=>{focus.add(r.source);focus.add(r.target);});
    }
    for(const node of nodes){
      const {g,ring}=nodeElements.get(node.id);
      const selected=node.id===activeId&&!relation;
      g.style.opacity=focus.has(node.id)?'1':'.25';
      ring.setAttribute('opacity',selected?'.16':'0');
      g.setAttribute('aria-pressed',String(selected));
      g.setAttribute('tabindex',selected?'0':'-1');
    }
    let highlighted=0;
    for(const r of relations){
      const {line,hit}=edgeElements.get(r.id);
      const on=relation?r.id===relation.id:(showAll||selectedGroup!=='all')?focus.has(r.source)&&focus.has(r.target):(r.source===activeId||r.target===activeId);
      line.style.opacity=on?'.82':'.07';
      line.setAttribute('stroke-width',on?'4':'2');
      hit.style.pointerEvents=on?'stroke':'none';
      if(on)highlighted++;
    }
    allButton.setAttribute('aria-pressed',String(showAll));
    allButton.textContent=showAll?'Focus selected passage':'Show all connections';
    status.textContent=`${highlighted} of ${relations.length} connections highlighted. Select a passage or connection to read its evidence.`;
  }
  function chooseNode(id) {
    if(!index.has(id))return;
    activeId=id;activeRelation=null;showAll=false;selectedGroup='all';
    nodeSelect.value=id;relationSelect.value='';groupSelect.value='all';
    showNodeEvidence(index.get(id));updateMap();
  }
  function chooseRelation(id) {
    const r=relations.find(x=>x.id===id);if(!r)return;
    activeRelation=id;showAll=false;selectedGroup='all';
    relationSelect.value=id;groupSelect.value='all';
    showRelationEvidence(r);updateMap();
  }
  nodeSelect.addEventListener('change',()=>chooseNode(nodeSelect.value));
  relationSelect.addEventListener('change',()=>relationSelect.value?chooseRelation(relationSelect.value):chooseNode(activeId));
  groupSelect.addEventListener('change',()=>{selectedGroup=groupSelect.value;activeRelation=null;relationSelect.value='';showAll=selectedGroup==='all';updateMap();});
  allButton.addEventListener('click',()=>{showAll=!showAll;activeRelation=null;relationSelect.value='';selectedGroup='all';groupSelect.value='all';showNodeEvidence(index.get(activeId));updateMap();});
  document.addEventListener('explore-node',event=>{
    const id=event.detail?.id;if(index.has(id)){chooseNode(id);document.querySelector('#explore')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  });
  chooseNode(activeId);
  return {selectNode:chooseNode,selectRelation:chooseRelation};
}
