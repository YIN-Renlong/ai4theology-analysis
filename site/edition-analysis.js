// Reproducible counts and explicitly proposed episode coding share the same evidence links.
const BASIS = {
  retrospective_account: 'Reported exchange',
  later_literature: 'Later reading',
  hypothetical_example: 'Hypothetical example',
  published_argument: 'Published argument',
};
const STATE = {
  retained: 'Retained', revised: 'Revised', unresolved: 'Unresolved',
  not_established: 'Not established', elaborated: 'Elaborated',
  qualified: 'Qualified', repaired: 'Repaired',
};
const SEQUENCE = {
  reported_order: 'Order reported in the essay',
  analytical_grouping: 'Analytical grouping of passages',
  hypothetical: 'Hypothetical sequence',
};
const words = value => String(value || '').replaceAll('_', ' ');
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function button(text, className, action) {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
function heading(title, introduction) {
  const head = el('header', 'an-subhead');
  head.append(el('h3', '', title));
  if (introduction) head.append(el('p', '', introduction));
  return head;
}
function sourceLinks(ids, callbacks, kind = 'paragraph') {
  const links = el('div', 'an-source-links');
  for (const id of ids || []) {
    links.append(button(id, 'an-source-link', () => {
      if (kind === 'paragraph') callbacks.openParagraph(id);
      else if (kind === 'node') callbacks.openNodes([id]);
      else callbacks.openRelations([id]);
    }));
  }
  return links;
}

export function mountAnalysis(container, report, callbacks) {
  container.replaceChildren();
  container.classList.add('edition-analysis');
  if (!report || !Array.isArray(report.episodes)) {
    container.append(el('p', 'an-note', 'The analysis report is unavailable. The article and its source evidence remain available below.'));
    return;
  }
  const counts = report.counts;
  const patterns = report.patterns;
  const episodes = report.episodes;
  const episodeById = new Map(episodes.map(item => [item.id, item]));
  const patternById = new Map(patterns.map(item => [item.id, item]));
  let selected = episodes[0]?.id;
  let selectedPattern = '';
  let basis = '';
  const summary = el('dl', 'an-summary');
  for (const [value, label] of [
    [counts.episodes, 'Selected episodes'],
    [counts.patterns, 'Candidate patterns'],
    [counts.relations, 'Annotated relationships'],
    [`${counts.annotated_body_blocks} / ${counts.body_blocks}`, 'Body blocks with anchors'],
  ]) {
    const item = el('div');
    item.append(el('dt', '', label), el('dd', '', value));
    summary.append(item);
  }
  container.append(summary, el('p', 'an-note', 'Counts describe this selected coding of one essay. Episode patterns and changes in reasoning are proposed interpretations awaiting researcher review. They are not learning scores.'));

  const coverage = el('section', 'an-coverage-section');
  const coverageDetails = el('details', 'an-coverage-details');
  coverageDetails.append(el('summary', '', 'See the coverage of the source text'));
  coverageDetails.append(el('p', 'an-note', `Blue cells contain an analytical anchor; outlined cells do not. Each cell opens its source block. ${counts.body_blocks} body blocks are shown in publication order, which does not establish the chronology of the conversation.`));
  const coverageGrid = el('div', 'an-coverage-grid');
  coverageGrid.setAttribute('role', 'group');
  coverageGrid.setAttribute('aria-label', 'Source blocks in publication order');
  for (const item of report.coverage || []) {
    const title = `${item.block_id} · ${item.section} · ${item.annotated ? 'has analytical anchors' : 'no analytical anchor'}`;
    const b = button('', `an-coverage-cell${item.annotated ? ' is-annotated' : ''}`, () => callbacks.openParagraph(item.block_id));
    b.title = title;
    b.setAttribute('aria-label', title);
    b.append(el('span', 'only-sr', item.block_id));
    coverageGrid.append(b);
  }
  coverageDetails.append(coverageGrid);
  coverage.append(coverageDetails);
  container.append(coverage);

  const study = el('section', 'an-study');
  study.append(heading('Patterns across the selected episodes', 'Read across a row to see the proposed coding of an episode. Choose an included pattern to examine the intellectual moves and their evidence. One episode can carry several codes.'));
  const tools = el('div', 'an-tools');
  const filterLabel = el('label', '', 'Evidence basis');
  filterLabel.htmlFor = 'analysis-basis';
  const filter = el('select');
  filter.id = 'analysis-basis';
  filter.append(el('option', '', 'All evidence bases'));
  filter.options[0].value = '';
  for (const key of Object.keys(BASIS)) {
    if (!episodes.some(item => item.basis === key)) continue;
    const option = el('option', '', BASIS[key]);
    option.value = key;
    filter.append(option);
  }
  const tally = el('p', 'an-note');
  tally.setAttribute('role', 'status');
  tools.append(filterLabel, filter, tally);
  const tableWrap = el('div', 'an-table-scroll');
  tableWrap.tabIndex = 0;
  tableWrap.setAttribute('role', 'region');
  tableWrap.setAttribute('aria-label', 'Episode and pattern matrix; scroll horizontally on small screens');
  const table = el('table', 'an-matrix');
  table.append(el('caption', 'only-sr', 'Proposed pattern coding for selected episodes. Included cells are inspectable; a dash means the pattern was not assigned, not that it is absent from the full conversation.'));
  const thead = el('thead');
  const headRow = el('tr');
  const firstHead = el('th', 'an-matrix-episode', 'Episode');
  firstHead.scope = 'col';
  headRow.append(firstHead);
  for (const pattern of patterns) {
    const th = el('th');
    th.scope = 'col';
    th.append(el('span', '', pattern.label));
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = el('tbody');
  const tfoot = el('tfoot');
  table.append(thead, tbody, tfoot);
  tableWrap.append(table);
  const detail = el('section', 'an-episode-detail');
  detail.setAttribute('aria-label', 'Selected episode and proposed reasoning changes');
  const detailAnnouncement = el('p', 'only-sr');
  detailAnnouncement.setAttribute('role', 'status');
  study.append(tools, tableWrap, el('p', 'an-note an-matrix-note', 'Included = assigned in this provisional coding. A dash = not assigned. Column counts use the displayed episodes as their denominator.'), detailAnnouncement, detail);
  container.append(study);

  function selectEpisode(id, patternId = '') {
    selected = id;
    selectedPattern = patternId;
    for (const row of tbody.rows) row.classList.toggle('is-selected', row.dataset.episode === id);
    for (const b of tbody.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.episode === id && (b.dataset.pattern || '') === patternId));
    renderDetail();
    detailAnnouncement.textContent = `Selected: ${episodeById.get(id)?.title || id}`;
  }
  function renderMatrix() {
    const visible = episodes.filter(item => !basis || item.basis === basis);
    if (!visible.some(item => item.id === selected)) {
      selected = visible[0]?.id;
      selectedPattern = '';
    }
    tally.textContent = `${visible.length} of ${episodes.length} selected episodes`;
    tbody.replaceChildren();
    for (const item of visible) {
      const row = el('tr');
      row.dataset.episode = item.id;
      row.classList.toggle('is-selected', item.id === selected);
      const th = el('th', 'an-matrix-episode');
      th.scope = 'row';
      const choice = button(item.title, 'an-episode-choice', () => selectEpisode(item.id));
      choice.dataset.episode = item.id;
      choice.setAttribute('aria-pressed', String(item.id === selected && !selectedPattern));
      th.append(choice, el('span', 'an-basis-label', BASIS[item.basis] || words(item.basis)));
      row.append(th);
      for (const pattern of patterns) {
        const td = el('td');
        if (item.pattern_ids.includes(pattern.id)) {
          const b = button('Included', 'an-matrix-cell', () => selectEpisode(item.id, pattern.id));
          b.dataset.episode = item.id;
          b.dataset.pattern = pattern.id;
          b.setAttribute('aria-label', `${item.title}: ${pattern.label}. Included; inspect evidence.`);
          b.setAttribute('aria-pressed', String(item.id === selected && selectedPattern === pattern.id));
          td.append(b);
        } else {
          const dash = el('span', 'an-unassigned', '—');
          dash.setAttribute('aria-label', 'Not assigned');
          td.append(dash);
        }
        row.append(td);
      }
      tbody.append(row);
    }
    tfoot.replaceChildren();
    const totals = el('tr');
    const label = el('th', '', 'Assigned / displayed');
    label.scope = 'row';
    totals.append(label);
    for (const pattern of patterns) totals.append(el('td', '', `${visible.filter(item => item.pattern_ids.includes(pattern.id)).length} / ${visible.length}`));
    tfoot.append(totals);
    renderDetail();
  }
  function renderDetail() {
    detail.replaceChildren();
    const item = episodeById.get(selected);
    if (!item) return;
    detail.append(el('p', 'an-kicker', `${item.id} · ${BASIS[item.basis] || words(item.basis)} · Proposed coding`), el('h3', '', item.title), el('p', 'an-episode-summary', item.summary));
    const selectedCode = patternById.get(selectedPattern);
    if (selectedCode) {
      const explanation = el('p', 'an-selected-code');
      explanation.append(el('strong', '', `${selectedCode.label}. `), document.createTextNode(selectedCode.definition));
      detail.append(explanation);
    }
    const columns = el('div', 'an-episode-columns');
    const route = el('div', 'an-route');
    route.append(el('h4', '', 'Intellectual moves'), el('p', 'an-note', SEQUENCE[item.sequence_status] || words(item.sequence_status)));
    const moves = el('ol', 'an-moves');
    for (const move of item.moves || []) {
      const li = el('li');
      li.append(el('span', 'an-actor', move.actor === 'author' ? 'YIN Renlong' : move.actor === 'assistant' ? 'AI, as reported' : 'Engagement with scholarship'), el('p', '', move.action), sourceLinks(move.node_ids, callbacks, 'node'));
      moves.append(li);
    }
    route.append(moves);
    const change = el('div', 'an-change');
    change.append(el('h4', '', 'What changes in the account?'));
    const states = el('dl', 'an-states');
    for (const [label, state] of [['Conclusion', item.change.conclusion], ['Justification', item.change.justification]]) {
      const row = el('div');
      row.append(el('dt', '', label), el('dd', '', STATE[state] || words(state)));
      states.append(row);
    }
    change.append(states, el('p', '', item.change.explanation));
    if ((item.change.earlier_node_ids || []).length) {
      const earlier = el('div', 'an-version-evidence');
      earlier.append(el('span', 'an-note', 'Earlier position or criterion'), sourceLinks(item.change.earlier_node_ids, callbacks, 'node'));
      change.append(earlier);
    }
    if ((item.change.later_node_ids || []).length) {
      const later = el('div', 'an-version-evidence');
      later.append(el('span', 'an-note', 'Later response or qualification'), sourceLinks(item.change.later_node_ids, callbacks, 'node'));
      change.append(later);
    }
    columns.append(route, change);
    const reflection = el('div', 'an-reflection');
    reflection.append(el('h4', '', 'Question for theological pedagogy'), el('p', '', item.pedagogical_question), el('p', 'an-note', item.limit));
    const source = el('div', 'an-episode-source');
    source.append(el('span', 'an-note', 'Read the source passages'), sourceLinks(item.source_ids, callbacks));
    detail.append(columns, reflection, source);
  }
  filter.addEventListener('change', () => {basis = filter.value; renderMatrix();});
  renderMatrix();

  const codebook = el('details', 'an-codebook');
  codebook.append(el('summary', '', 'Read the provisional codebook'));
  codebook.append(el('p', 'an-note', 'Definitions guide consistent interpretation across texts. These categories are a starting proposal, not an exhaustive or validated taxonomy.'));
  for (const pattern of patterns) {
    const item = el('section');
    item.append(el('h4', '', pattern.label), el('p', '', pattern.definition));
    for (const [label, value] of [['Include', pattern.inclusion], ['Exclude', pattern.exclusion]]) {
      const line = el('p');
      line.append(el('strong', '', label+': '), document.createTextNode(Array.isArray(value) ? value.join(' ') : value));
      item.append(line);
    }
    codebook.append(item);
  }
  container.append(codebook);

  const relationSection = el('section', 'an-relations');
  relationSection.append(heading('Different links answer different questions', 'Argument links connect claims. Interaction links identify a response to a contribution. Reported-sequence links preserve an ordering explicitly described in the essay.'));
  const familyLayout = el('div', 'an-family-layout');
  const familyBars = el('div', 'an-family-bars');
  const familyDetail = el('div', 'an-family-detail');
  const families = report.relation_families || [];
  const largestFamily = Math.max(1, ...families.map(item => item.count));
  function showFamily(family) {
    for (const b of familyBars.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.family === family.id));
    familyDetail.replaceChildren(el('h4', '', family.label));
    for (const item of (report.relation_types || []).filter(item => item.family === family.id)) {
      const row = el('div', 'an-type-row');
      row.append(el('span', '', words(item.type)), el('strong', '', item.count), sourceLinks(item.relation_ids, callbacks, 'relation'));
      familyDetail.append(row);
    }
  }
  for (const family of families) {
    const b = button('', 'an-family-bar', () => showFamily(family));
    b.dataset.family = family.id;
    const label = el('span', 'an-bar-label');
    label.append(el('span', '', family.label), el('strong', '', family.count));
    const bar = el('span', 'an-bar-track');
    const fill = el('span', 'an-bar-fill');
    fill.style.width = `${100 * family.count / largestFamily}%`;
    bar.setAttribute('aria-hidden', 'true');
    bar.append(fill);
    b.append(label, bar);
    familyBars.append(b);
  }
  familyLayout.append(familyBars, familyDetail);
  relationSection.append(familyLayout, el('p', 'an-note', 'These counts use the annotated relationships as their denominator. A connected graph path is not automatically a chronological sequence or a valid chain of inference.'));
  container.append(relationSection);
  if (families.length) showFamily(families[0]);
  const motifRecords = report.graph?.motifs || [];
  if (motifRecords.length) {
    const motifs = el('details', 'an-motifs');
    motifs.append(el('summary', '', 'Computed graph patterns'));
    motifs.append(el('p', 'an-note', 'Python searches the annotated graph for explicitly defined configurations. These rule matches are computed from the proposed relationships; they are not independently discovered learning events in the raw text.'));
    const motifGrid = el('div', 'an-motif-grid');
    for (const motif of motifRecords) {
      const item = el('section', 'an-motif');
      const count = el('p', 'an-motif-count');
      count.append(el('strong', '', motif.count), document.createTextNode(motif.count === 1 ? ' graph match' : ' graph matches'));
      item.append(count, el('h4', '', motif.label), el('p', '', motif.definition));
      for (const [index, match] of (motif.matches || []).entries()) {
        const evidence = el('div', 'an-motif-evidence');
        if (motif.matches.length > 1) evidence.append(el('span', 'an-note', `Match ${index + 1}`));
        evidence.append(button('Read matched ideas', 'an-motif-button', () => callbacks.openNodes(match.node_ids)), sourceLinks(match.relation_ids, callbacks, 'relation'));
        item.append(evidence);
      }
      item.append(el('p', 'an-note', motif.limitation));
      motifGrid.append(item);
    }
    motifs.append(motifGrid);
    container.append(motifs);
  }

  const lexical = report.lexical_returns || {};
  const pairs = lexical.pairs || [];
  const returns = el('section', 'an-returns');
  returns.append(heading('Where similar wording reappears', 'Python compares vocabulary across separated passages using TF–IDF and cosine similarity. These are candidates for close reading: similar wording can revisit an idea, repeat a quotation, or concern a different argument.'));
  const returnLayout = el('div', 'an-return-layout');
  const returnList = el('div', 'an-return-list');
  const returnDetail = el('div', 'an-return-detail');
  function showPair(pair, index) {
    for (const b of returnList.querySelectorAll('button')) b.setAttribute('aria-pressed', String(Number(b.dataset.pair) === index));
    returnDetail.replaceChildren(el('p', 'an-kicker', 'Candidate for close reading'), el('h4', '', `${pair.earlier_id} and ${pair.later_id}`));
    const metric = el('p', 'an-similarity');
    metric.append(el('strong', '', Number(pair.score).toFixed(3)), document.createTextNode(' lexical similarity · 0–1'));
    returnDetail.append(metric, el('p', '', `Shared terms: ${(pair.shared_terms || []).map(t => typeof t === 'string' ? t : t.term).join(', ')}.`), sourceLinks([pair.earlier_id, pair.later_id], callbacks), el('p', 'an-note', 'Earlier and later refer to position in the published text. This score does not measure agreement, understanding or the historical order of thinking.'));
  }
  pairs.forEach((pair, i) => {
    const b = button('', 'an-return-choice', () => showPair(pair, i));
    b.dataset.pair = String(i);
    const label = el('span', 'an-bar-label');
    label.append(el('span', '', `${pair.earlier_id} · ${pair.later_id}`), el('span', '', Number(pair.score).toFixed(3)));
    const bar = el('span', 'an-bar-track');
    const fill = el('span', 'an-bar-fill');
    fill.style.width = `${Math.max(0, Math.min(1, Number(pair.score))) * 100}%`;
    bar.setAttribute('aria-hidden', 'true');
    bar.append(fill);
    b.append(label, bar);
    returnList.append(b);
  });
  if (pairs.length) showPair(pairs[0], 0);
  else returnList.append(el('p', 'an-note', 'No passage pairs met the current retrieval criteria.'));
  returnLayout.append(returnList, returnDetail);
  const method = el('details', 'an-retrieval-method');
  method.append(el('summary', '', 'How these candidates are calculated'));
  const description = typeof lexical.method === 'string' ? lexical.method : 'Tokens are weighted by their frequency within a passage and their rarity across the article. Cosine similarity compares the resulting vectors.';
  method.append(el('p', '', description));
  const limitations = Array.isArray(lexical.limitations) ? lexical.limitations.join(' ') : lexical.limitations;
  if (limitations) method.append(el('p', 'an-note', limitations));
  returns.append(returnLayout, method);
  container.append(returns);

  const downloads = el('div', 'downloads an-downloads');
  for (const [filename, label] of [
    ['collaboration-analysis.json', 'Analysis JSON'],
    ['collaboration-episodes.csv', 'Episode data CSV'],
    ['collaboration-relations.csv', 'Relationship data CSV'],
    ['collaboration-codebook.json', 'Provisional codebook'],
    ['collaboration-report.md', 'Python analysis report'],
  ]) {
    const a = el('a', '', label);
    a.href = 'data/' + filename;
    a.download = filename;
    downloads.append(a);
  }
  container.append(downloads);
}
