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
export function mountExplorer(container, data, onEvidence) {
  const nodes = data.nodes;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const relations = data.relations.filter(rel => byId.has(rel.source) && byId.has(rel.target));
  let selected = nodes[0]?.id;
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
  const layout = element('div', 'ex-layout');
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
  directory.append(filterLabel, reset, tally, list);
  const focus = element('div', 'ex-focus');
  const detail = element('section', 'ex-detail');
  detail.setAttribute('aria-label', 'Selected annotation');
  const graphTitle = element('h3', 'ex-small-heading', 'Connected ideas');
  const graph = element('div', 'ex-graph');
  graph.setAttribute('aria-label', 'Immediate relationships of the selected annotation');
  const graphNote = element('p', 'ex-graph-note', 'Follow a connected idea to inspect its interpretation. Arrows follow the direction assigned in the annotation record.');
  focus.append(detail, graphTitle, graph, graphNote);
  layout.append(directory, focus);
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
  container.append(note, counts, layout, relationSection);

  function matchesFilters(node) {
    const text = [node.id, node.label, node.interpretation, ...node.evidence.spans.map(span => span.block_id)].join(' ').toLowerCase();
    return (!basis || node.record_basis === basis) && (!query || text.includes(query));
  }
  function updateList() {
    for (const b of countButtons) b.setAttribute('aria-pressed', String(b.dataset.basis === basis));
    reset.setAttribute('aria-pressed', String(!basis));
    const matches = nodes.filter(matchesFilters);
    if (!matches.some(node => node.id === selected)) selected = matches[0]?.id;
    tally.textContent = `${matches.length} of ${nodes.length} annotations`;
    list.replaceChildren();
    for (const node of matches) {
      const b = button('', 'ex-node-button', () => selectNode(node.id));
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
    graphTitle.hidden = !selected;
    graphNote.hidden = !selected;
    graph.hidden = !selected;
    if (!selected) return;
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
  updateList();
  return () => { destroyed = true; if (observer) observer.disconnect(); };
}
