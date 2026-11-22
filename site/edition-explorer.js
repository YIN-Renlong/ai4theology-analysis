// Every relationship and excerpt is drawn from the exported annotation records.
const SVG_NS = 'http://www.w3.org/2000/svg';
const BASIS = {
  published_argument: 'Published argument',
  retrospective_account: 'Reported exchange',
  hypothetical_example: 'Hypothetical example',
  later_literature: 'Later reading',
};
const RELATIONS = {
  questions_relevance_of: 'questions the relevance of',
  follows_acknowledgment_in_account: 'follows the acknowledgment in the account',
  offers_alternative_to: 'offers an alternative to',
  illustrates_misapplication: 'illustrates a misapplication in',
  develops_example: 'develops the example in',
  returns_to: 'returns to',
};
const label = value => RELATIONS[value] || String(value || '').replaceAll('_', ' ');
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function button(text, className, action) {
  const el = element('button', className, text);
  el.type = 'button';
  el.addEventListener('click', action);
  return el;
}
export function episodeSubgraph(episode, nodes, relations) {
  const included = new Set(episode?.node_ids || []);
  const visible = nodes.filter(node => included.has(node.id));
  const available = new Set(visible.map(node => node.id));
  return {nodes: visible, relations: relations.filter(rel => available.has(rel.source) && available.has(rel.target))};
}
export function mountExplorer(container, data, onEvidence, collaboration = {}) {
  const nodes = data.nodes;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const relations = data.relations.filter(rel => byId.has(rel.source) && byId.has(rel.target));
  const episodes = (collaboration.episodes || []).filter(episode => episode.node_ids?.some(id => byId.has(id)));
  let currentEpisode = episodes.find(episode => episode.id === 'E02') || episodes[0];
  let view = currentEpisode ? 'episode' : 'nearby';
  let selected = currentEpisode?.node_ids.find(id => byId.has(id)) || nodes[0]?.id;
  const families = new Map();
  for (const family of collaboration.relation_families || []) {
    for (const id of family.relation_ids || []) families.set(id, family.id);
  }
  const familyNames = {argument: 'Argument and reference', interaction: 'Interaction response', reported_sequence: 'Reported order'};
  let basis = '';
  let query = '';
  let observer;
  let destroyed = false;
  container.classList.add('edition-explorer');
  container.replaceChildren();
  const note = element('p', 'ex-note', `${nodes.length} proposed annotations and ${relations.length} proposed relationships. These counts describe this reading of the essay. They do not measure learning or the amount of human contribution.`);
  const counts = element('div', 'ex-counts');
  counts.setAttribute('role', 'group');
  counts.setAttribute('aria-label', 'Filter annotations by evidence basis');
  const reset = button('All annotations', 'ex-reset', () => {basis = ''; updateList();});
  const countButtons = [];
  for (const [key, title] of Object.entries(BASIS)) {
    const amount = nodes.filter(n => n.record_basis === key).length;
    const b = button('', 'ex-count', () => {basis = basis === key ? '' : key; updateList();});
    b.dataset.basis = key;
    b.setAttribute('aria-pressed', 'false');
    b.append(element('strong', '', String(amount)), element('span', '', title));
    const bar = element('span', 'ex-count-bar');
    bar.style.setProperty('--amount', String(amount / Math.max(1, nodes.length)));
    bar.setAttribute('aria-hidden', 'true');
    b.append(bar);
    counts.append(b);
    countButtons.push(b);
  }
  const layout = element('div', 'ex-layout ex-layout-compact');
  const catalogue = element('details', 'ex-catalogue');
  const catalogueSummary = element('summary', '', `Browse all ${nodes.length} annotations`);
  const directory = element('div', 'ex-directory');
  const filterLabel = element('label', 'ex-search-label', 'Find an annotation');
  const search = element('input', 'ex-search');
  search.type = 'search';
  search.placeholder = 'Search ideas or paragraph IDs';
  filterLabel.append(search);
  search.addEventListener('input', () => {query = search.value.trim().toLowerCase(); updateList();});
  const tally = element('p', 'ex-tally');
  tally.setAttribute('role', 'status');
  const list = element('div', 'ex-node-list');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Annotations');
  directory.append(counts, filterLabel, reset, tally, list);
  catalogue.append(catalogueSummary, directory);
  const focus = element('div', 'ex-focus');
  const detail = element('section', 'ex-detail');
  detail.setAttribute('aria-label', 'Selected annotation');
  detail.tabIndex = -1;
  const graphTitle = element('h3', 'ex-small-heading', 'Connected ideas');
  const graph = element('div', 'ex-graph');
  graph.setAttribute('aria-label', 'Immediate relationships of the selected annotation');
  const graphNote = element('p', 'ex-graph-note', 'Follow a connected idea to inspect its interpretation. Arrows follow the direction assigned in the annotation record.');
  const graphSection = element('section', 'ex-graph-section');
  graphSection.setAttribute('aria-label', 'Explore recorded connections');
  const controls = element('div', 'ex-graph-controls');
  const views = element('div', 'ex-view-controls');
  views.setAttribute('role', 'group');
  views.setAttribute('aria-label', 'Relationship view');
  const wholeButton = button('Whole episode', 'ex-view-button', () => {view = 'episode'; if (!currentEpisode.node_ids.includes(selected)) {selectNode(currentEpisode.node_ids.find(id => byId.has(id)));} else renderGraph();});
  const nearbyButton = button('Nearby connections', 'ex-view-button', () => {view = 'nearby'; renderGraph();});
  wholeButton.hidden = !episodes.length;
  views.append(wholeButton, nearbyButton);
  const episodeLabel = element('label', 'ex-episode-label', 'Select an episode');
  const episodeSelect = element('select', 'ex-episode-select');
  episodeSelect.setAttribute('aria-label', 'Select a relationship episode');
  for (const episode of episodes) {
    const option = element('option', '', episode.id + ' · ' + episode.title);
    option.value = episode.id;
    episodeSelect.append(option);
  }
  episodeSelect.value = currentEpisode?.id || '';
  episodeSelect.addEventListener('change', () => {
    currentEpisode = episodes.find(episode => episode.id === episodeSelect.value);
    selected = currentEpisode.node_ids.find(id => byId.has(id));
    basis = ''; query = ''; search.value = '';
    updateList();
  });
  episodeLabel.append(episodeSelect);
  controls.append(views, episodeLabel);
  const episodeIntro = element('p', 'ex-episode-intro');
  const legend = element('div', 'ex-graph-legend');
  const episodeLinks = element('div', 'ex-episode-link-list');
  const selectedEvidence = button('Read selected idea', 'ex-text-button', () => selected && onEvidence({nodes:[selected]}));
  graphSection.append(graphTitle, controls, episodeIntro, legend, graph, graphNote, selectedEvidence, episodeLinks);
  focus.append(detail);
  layout.append(catalogue, focus);
  const relationSection = element('section', 'ex-relations');
  relationSection.append(element('h3', '', 'All recorded relationships'));
  const relationIntro = element('p', 'ex-note', 'Open a relationship to read the reason for linking its passages. The labels remain proposed interpretations for review.');
  relationSection.append(relationIntro);
  const relationList = element('div', 'ex-relation-list');
  for (const rel of relations) {
    const fold = element('details', 'ex-relation');
    const summary = element('summary');
    summary.append(element('span', 'ex-record-id', rel.id), element('span', '', `${byId.get(rel.source).label} — ${label(rel.type)} — ${byId.get(rel.target).label}`));
    const body = element('div', 'ex-relation-body');
    body.append(element('p', '', rel.rationale || 'No rationale is recorded.'));
    const links = element('div', 'ex-detail-actions');
    links.append(button('View source idea', 'ex-text-button', () => selectNode(rel.source, true)), button('View target idea', 'ex-text-button', () => selectNode(rel.target, true)), button('Read relationship evidence', 'ex-text-button', () => onEvidence({relations: [rel.id]})));
    body.append(links);
    fold.append(summary, body);
    relationList.append(fold);
  }
  relationSection.append(relationList);
  container.append(note, layout, graphSection, relationSection);

  function matchesFilters(node) {
    const text = [node.id, node.label, node.interpretation, ...node.evidence.spans.map(span => span.block_id)].join(' ').toLowerCase();
    return (!basis || node.record_basis === basis) && (!query || text.includes(query));
  }
  function updateList() {
    for (const b of countButtons) b.setAttribute('aria-pressed', String(b.dataset.basis === basis));
    reset.setAttribute('aria-pressed', String(!basis));
    const matches = nodes.filter(matchesFilters);
    if (!matches.some(node => node.id === selected)) selected = matches[0]?.id;
    if (view === 'episode' && selected && !currentEpisode?.node_ids.includes(selected)) view = 'nearby';
    tally.textContent = `${matches.length} of ${nodes.length} annotations`;
    list.replaceChildren();
    for (const node of matches) {
      const b = button('', 'ex-node-button', () => {
        selectNode(node.id);
        catalogue.open = false;
        detail.focus({preventScroll:true});
      });
      b.dataset.node = node.id;
      b.setAttribute('aria-pressed', String(node.id === selected));
      b.append(element('span', 'ex-record-id', node.id), element('span', '', node.label));
      list.append(b);
    }
    if (!matches.length) list.append(element('p', 'ex-empty', 'No annotations match this search.'));
    renderDetail();
    renderGraph();
  }
  function selectNode(id, scroll = false) {
    selected = id;
    if (view === 'episode' && !currentEpisode?.node_ids.includes(id)) view = 'nearby';
    if (!matchesFilters(byId.get(id))) {
      basis = '';
      query = '';
      search.value = '';
      updateList();
    } else {
      for (const b of list.querySelectorAll('[data-node]')) b.setAttribute('aria-pressed', String(b.dataset.node === id));
      renderDetail();
      renderGraph();
    }
    if (scroll) detail.scrollIntoView({block: 'start', behavior: 'auto'});
  }
  function renderDetail() {
    const node = byId.get(selected);
    detail.replaceChildren();
    if (!node) {
      detail.append(element('p', 'ex-empty', 'No matching annotation. Clear the search or choose another evidence basis.'));
      return;
    }
    detail.append(element('p', 'ex-kicker', `${node.id} · ${BASIS[node.record_basis] || label(node.record_basis)}`), element('h3', '', node.label), element('p', 'ex-interpretation', node.interpretation));
    const meta = element('dl', 'ex-meta');
    for (const [title, value] of [['Attributed voice', label(node.actor_as_reported)], ['Review', label(node.review_status)], ['Passages', [...new Set(node.evidence.spans.map(s => s.block_id))].join(', ')]]) {
      const row = element('div');
      row.append(element('dt', '', title), element('dd', '', value));
      meta.append(row);
    }
    detail.append(meta, button('Read source evidence', 'ex-text-button', () => onEvidence({nodes:[selected]})));
  }
  function renderGraph() {
    if (observer) observer.disconnect();
    graph.replaceChildren();
    episodeLinks.replaceChildren(); legend.replaceChildren();
    graph.classList.toggle('ex-whole-episode', view === 'episode');
    wholeButton.setAttribute('aria-pressed', String(view === 'episode'));
    nearbyButton.setAttribute('aria-pressed', String(view === 'nearby'));
    episodeLabel.hidden = view !== 'episode';
    episodeIntro.hidden = view !== 'episode' || !selected;
    episodeLinks.hidden = view !== 'episode' || !selected;
    legend.hidden = view !== 'episode' || !selected;
    selectedEvidence.hidden = !selected;
    selectedEvidence.textContent = selected ? 'Read selected idea · ' + selected : 'Read selected idea';
    graphTitle.textContent = view === 'episode' ? 'The connections within an episode' : 'Connected ideas';
    graph.setAttribute('aria-label', view === 'episode' ? 'All recorded links within the selected episode' : 'Immediate relationships of the selected annotation');
    graphNote.textContent = view === 'episode'
      ? 'Each line is a recorded relationship. Select an idea or a relationship label to read its evidence. Positions organise the display; they do not represent time or strength.'
      : 'Follow a connected idea to inspect its interpretation. Arrows follow the direction assigned in the annotation record.';
    graphTitle.hidden = !selected;
    graphNote.hidden = !selected;
    graph.hidden = !selected;
    if (!selected) return;
    if (view === 'episode' && currentEpisode) {renderEpisode(); return;}
    const incoming = relations.filter(r => r.target === selected);
    const outgoing = relations.filter(r => r.source === selected);
    if (!incoming.length && !outgoing.length) {
      graph.append(element('p', 'ex-empty', 'No relationship has been annotated for this idea yet. Its source passage is available above.'));
      return;
    }
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ex-lines');
    svg.setAttribute('aria-hidden', 'true');
    graph.append(svg);
    const left = element('div', 'ex-neighbors');
    const center = element('div', 'ex-center');
    const right = element('div', 'ex-neighbors');
    const current = element('div', 'ex-current');
    current.append(element('span', 'ex-record-id', selected), element('strong', '', byId.get(selected).label));
    center.append(current);
    const pairs = [];
    function neighbor(rel, side) {
      const id = side === 'left' ? rel.source : rel.target;
      const wrapper = element('div', 'ex-neighbor');
      const b = button('', 'ex-neighbor-button', () => selectNode(id));
      b.append(element('span', 'ex-record-id', id), element('span', '', byId.get(id).label));
      const description = element('p', 'ex-edge-label', label(rel.type));
      wrapper.append(b, description);
      pairs.push({button:b, side});
      return wrapper;
    }
    incoming.forEach(rel => left.append(neighbor(rel,'left')));
    outgoing.forEach(rel => right.append(neighbor(rel,'right')));
    graph.append(left, center, right);
    function draw() {
      if (destroyed || !graph.isConnected) return;
      svg.replaceChildren();
      const rect = graph.getBoundingClientRect();
      const middle = current.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
      for (const pair of pairs) {
        const r = pair.button.getBoundingClientRect();
        const from = pair.side === 'left' ? [r.right-rect.left,r.top+r.height/2-rect.top] : [middle.right-rect.left,middle.top+middle.height/2-rect.top];
        const to = pair.side === 'left' ? [middle.left-rect.left,middle.top+middle.height/2-rect.top] : [r.left-rect.left,r.top+r.height/2-rect.top];
        const dx = (to[0]-from[0])/2;
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d',`M${from[0]},${from[1]} C${from[0]+dx},${from[1]} ${to[0]-dx},${to[1]} ${to[0]},${to[1]}`);
        svg.append(path);
        const arrow = document.createElementNS(SVG_NS, 'path');
        arrow.setAttribute('class','ex-arrow');
        arrow.setAttribute('d',`M${to[0]-5},${to[1]-3} L${to[0]},${to[1]} L${to[0]-5},${to[1]+3}`);
        svg.append(arrow);
      }
    }
    if (window.ResizeObserver) {
      observer = new ResizeObserver(draw);
      observer.observe(graph);
    }
    requestAnimationFrame(draw);
  }
  function renderEpisode() {
    const subset = episodeSubgraph(currentEpisode, nodes, relations);
    const order = new Map(currentEpisode.node_ids.map((id, index) => [id, index]));
    subset.nodes.sort((a,b) => order.get(a.id) - order.get(b.id));
    episodeIntro.textContent = currentEpisode.title + ' · ' + subset.nodes.length + ' ideas · ' + subset.relations.length + ' recorded links. ' + BASIS[currentEpisode.basis] + '.';
    const usedFamilies = new Set(subset.relations.map(rel => families.get(rel.id) || 'argument'));
    for (const family of ['argument', 'interaction', 'reported_sequence']) {
      if (!usedFamilies.has(family)) continue;
      const item = element('span', 'ex-legend-item ex-family-' + family);
      item.append(element('i'), document.createTextNode(familyNames[family]));
      legend.append(item);
    }
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ex-episode-lines');
    svg.setAttribute('aria-hidden', 'true');
    const stage = element('div', 'ex-episode-stage');
    stage.append(svg);
    const cards = element('div', 'ex-episode-cards');
    const nodeElements = new Map();
    for (const node of subset.nodes) {
      const card = button('', 'ex-episode-node', () => {
        const restoreFocus = document.activeElement === card;
        selectNode(node.id);
        if (restoreFocus) graph.querySelector('[data-node="' + node.id + '"]')?.focus({preventScroll:true});
      });
      card.dataset.node = node.id;
      card.setAttribute('aria-pressed', String(node.id === selected));
      card.setAttribute('aria-label', node.id + ' · ' + node.label + '. Select interpretation.');
      const actor = node.actor_as_reported === 'assistant' ? 'AI, as reported' : node.actor_as_reported === 'source' ? 'Scholarly source' : 'YIN Renlong';
      card.append(element('span', 'ex-episode-node-meta', node.id + ' · ' + actor), element('span', 'ex-episode-node-title', node.label));
      cards.append(card); nodeElements.set(node.id, card);
    }
    stage.append(cards); graph.append(stage);
    const relationButtons = new Map();
    for (const rel of subset.relations) {
      const family = families.get(rel.id) || 'argument';
      const edgeLabel = button(rel.id, 'ex-edge-control ex-family-' + family, () => onEvidence({relations:[rel.id]}));
      edgeLabel.setAttribute('aria-label', rel.id + ': ' + byId.get(rel.source).label + ' ' + label(rel.type) + ' ' + byId.get(rel.target).label + '. Read evidence.');
      edgeLabel.title = rel.source + ' ' + label(rel.type) + ' ' + rel.target;
      stage.append(edgeLabel); relationButtons.set(rel.id, edgeLabel);
      const line = button('', 'ex-episode-link ex-family-' + family, () => onEvidence({relations:[rel.id]}));
      line.append(element('span', 'ex-record-id', rel.id), element('span', '', rel.source + ' ' + label(rel.type) + ' ' + rel.target));
      episodeLinks.append(line);
    }
    if (!subset.relations.length) episodeLinks.append(element('p', 'ex-empty', 'No relationship between these selected ideas is recorded.'));
    function drawEpisode() {
      if (destroyed || !graph.isConnected) return;
      const compact = graph.clientWidth < 650;
      if (stage.classList.contains('ex-compact') !== compact) stage.classList.toggle('ex-compact', compact);
      svg.replaceChildren();
      const rect = stage.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
      const occupied = [];
      for (const [index, rel] of subset.relations.entries()) {
        const sr = nodeElements.get(rel.source).getBoundingClientRect();
        const tr = nodeElements.get(rel.target).getBoundingClientRect();
        const sy = sr.top + sr.height/2 - rect.top, ty = tr.top + tr.height/2 - rect.top;
        const sameColumn = Math.abs(sr.left - tr.left) < 10;
        const sourceOnLeft = sr.left < tr.left;
        const columnOnLeft = compact || (sr.left + sr.width/2 - rect.left) < rect.width/2;
        let sx,tx,cx,direction;
        if (sameColumn) {
          const useLeft = !compact && columnOnLeft;
          sx = (useLeft ? sr.left : sr.right) - rect.left;
          tx = (useLeft ? tr.left : tr.right) - rect.left;
          cx = (useLeft ? Math.min(sx,tx) : Math.max(sx,tx)) + (useLeft ? -1 : 1) * (24 + (index % 4)*12);
          direction = useLeft ? 1 : -1;
        } else {
          sx = (sourceOnLeft ? sr.right : sr.left) - rect.left;
          tx = (sourceOnLeft ? tr.left : tr.right) - rect.left;
          cx = (sx + tx)/2 + ((index % 3)-1)*15;
          direction = sourceOnLeft ? 1 : -1;
        }
        const family = families.get(rel.id) || 'argument';
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('class', 'ex-family-' + family);
        path.setAttribute('d', `M${sx},${sy} C${cx},${sy} ${cx},${ty} ${tx},${ty}`);
        svg.append(path);
        const arrow = document.createElementNS(SVG_NS, 'path');
        arrow.setAttribute('class', 'ex-episode-arrow ex-family-' + family);
        arrow.setAttribute('d', `M${tx-direction*7},${ty-4} L${tx},${ty} L${tx-direction*7},${ty+4}`);
        svg.append(arrow);
        let ly = (sy+ty)/2;
        const lx = Math.min(rect.width-24, Math.max(24, sameColumn ? cx : .125*sx + .75*cx + .125*tx));
        while (occupied.some(point => Math.abs(point.x-lx)<43 && Math.abs(point.y-ly)<29)) ly += 30;
        occupied.push({x:lx,y:ly});
        const labelButton = relationButtons.get(rel.id);
        labelButton.style.left = lx + 'px';
        labelButton.style.top = Math.min(rect.height-15, Math.max(15,ly)) + 'px';
      }
    }
    if (window.ResizeObserver) {
      observer = new ResizeObserver(drawEpisode);
      observer.observe(graph);
      for (const card of nodeElements.values()) observer.observe(card);
    }
    requestAnimationFrame(drawEpisode);
  }
  updateList();
  return () => { destroyed = true; if (observer) observer.disconnect(); };
}
