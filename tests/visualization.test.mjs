import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectLexicalLinks} from '../site/edition-context.js';

const block = (id, extra = {}) => ({id, kind: 'paragraph', is_reference: false, ...extra});

test('lexical arcs use body order including ineligible short passages', () => {
  const blocks = [block('p1'), block('short'), block('p3'), block('p4')];
  const matrix = {block_ids: ['p1', 'p3', 'p4'], values: [[1, .8, .3], [.8, 1, .9], [.3, .9, 1]]};
  const links = selectLexicalLinks(matrix, blocks, {minimum_cosine: .1, min_body_index_distance: 3});
  assert.deepEqual(links, [{i: 0, j: 2, earlier_id: 'p1', later_id: 'p4', score: .3, body_index_distance: 3}]);
});

test('arcs exclude references, headings, self pairs and below-threshold values', () => {
  const blocks = [block('p1'), block('ref', {is_reference: true}), block('title', {kind: 'heading'}), block('p2'), block('p3')];
  const matrix = {block_ids: ['p1', 'ref', 'title', 'p2', 'p3'], values: [
    [1,.9,.9,.09,.1], [.9,1,.9,.9,.9], [.9,.9,1,.9,.9], [.09,.9,.9,1,.8], [.1,.9,.9,.8,1],
  ]};
  const links = selectLexicalLinks(matrix, blocks, {minimum_cosine: .1, min_body_index_distance: 1});
  assert.deepEqual(links.map(l => [l.earlier_id, l.later_id, l.score]), [['p2', 'p3', .8], ['p1', 'p3', .1]]);
});

test('pair ranking is deterministic, limited, undirected and leaves inputs unchanged', () => {
  const blocks = ['a','b','c'].map(id => block(id));
  const matrix = {block_ids: ['a','b','c'], values: [[1,.4,.4],[.4,1,.3],[.4,.3,1]]};
  const before = JSON.stringify(matrix);
  const options = {minimum_cosine: .1, min_body_index_distance: 1};
  const links = selectLexicalLinks(matrix, blocks, options, 2);
  assert.deepEqual(links.map(l => [l.earlier_id,l.later_id]), [['a','b'],['a','c']]);
  assert.equal(selectLexicalLinks(matrix, blocks, options, 0).length, 0);
  assert.equal(JSON.stringify(matrix), before);
});

test('published arc candidates agree with the Python retrieval shortlist', () => {
  const report = JSON.parse(readFileSync(new URL('../site/data/collaboration-analysis.json', import.meta.url)));
  const data = JSON.parse(readFileSync(new URL('../site/data/analysis.json', import.meta.url)));
  const lexical = report.lexical_returns;
  const links = selectLexicalLinks(lexical.matrix, data.article.blocks, lexical.options);
  assert.equal(links.length, 138);
  assert.deepEqual(links.slice(0, lexical.pairs.length).map(({earlier_id,later_id,score})=>({earlier_id,later_id,score})),
    lexical.pairs.map(({earlier_id,later_id,score})=>({earlier_id,later_id,score})));
});
