"""Validate contextual close readings and aggregate their source-linked coverage.

The classifications are supplied interpretations. Counts are computed from their
verified passage anchors, not inferred from keyword occurrences.
"""
from copy import deepcopy


def contextual_analysis(blocks, coding):
    if coding.get('version') != 1:
        raise ValueError('Unsupported contextual codebook version')
    for field in ('method', 'limitation'):
        if not isinstance(coding.get(field), str) or not coding[field].strip():
            raise ValueError('Missing contextual ' + field)
    body = [b for b in blocks if not b.get('is_reference') and b['kind'] != 'heading']
    by_id = {b['id']: b for b in body}
    concepts = coding.get('codebook', [])
    concept_ids = set()
    for concept in concepts:
        for field in ('id', 'label', 'definition'):
            if not isinstance(concept.get(field), str) or not concept[field].strip():
                raise ValueError('Invalid contextual concept ' + field)
        if concept['id'] in concept_ids:
            raise ValueError('Duplicate contextual concept')
        concept_ids.add(concept['id'])
    if not concept_ids:
        raise ValueError('Empty contextual codebook')
    for field in ('subjects', 'modes'):
        if not isinstance(coding.get(field), dict) or not coding[field]:
            raise ValueError('Missing contextual ' + field)
    sections, section_for = [], {}
    for block in body:
        label = block['section']
        if label not in section_for:
            section_for[label] = {'id': 'S' + str(len(sections) + 1).zfill(2),
                                  'label': label, 'total_body_blocks': 0}
            sections.append(section_for[label])
        section_for[label]['total_body_blocks'] += 1
    records, identities, assignments = [], set(), set()
    for item in coding.get('records', []):
        for field in ('id', 'block_id', 'concept_id', 'subject', 'mode', 'quote', 'interpretation', 'review_status'):
            if not isinstance(item.get(field), str) or not item[field].strip():
                raise ValueError('Missing contextual record ' + field)
        if item['id'] in identities:
            raise ValueError('Duplicate contextual record ID')
        identities.add(item['id'])
        if item['block_id'] not in by_id or item['concept_id'] not in concept_ids:
            raise ValueError('Unknown contextual passage or concept')
        if item['subject'] not in coding['subjects'] or item['mode'] not in coding['modes']:
            raise ValueError('Unknown contextual subject or mode')
        if item['review_status'] not in ('proposed_by_assistant', 'reviewed_by_author', 'revised_by_author', 'unresolved'):
            raise ValueError('Unknown contextual review status')
        pair = (item['block_id'], item['concept_id'])
        if pair in assignments:
            raise ValueError('Duplicate concept assignment to one passage')
        assignments.add(pair)
        source = by_id[item['block_id']]
        quote = item['quote']
        if source['text'].count(quote) != 1:
            raise ValueError('Missing or ambiguous contextual quote: ' + item['id'])
        start = source['text'].index(quote)
        record = deepcopy(item)
        record.pop('quote')
        record['section_id'] = section_for[source['section']]['id']
        record['subject_label'] = coding['subjects'][item['subject']]
        record['mode_label'] = coding['modes'][item['mode']]
        record['evidence'] = {'quote': quote, 'start': start, 'end': start + len(quote)}
        records.append(record)
    if not records:
        raise ValueError('No contextual readings supplied')
    order = {b['id']: i for i, b in enumerate(body)}
    records.sort(key=lambda r: (order[r['block_id']], r['id']))
    cells = []
    for concept in concepts:
        for section in sections:
            hits = [r for r in records if r['concept_id'] == concept['id'] and r['section_id'] == section['id']]
            block_ids = sorted({r['block_id'] for r in hits}, key=order.get)
            cells.append({'concept_id': concept['id'], 'section_id': section['id'],
                          'block_ids': block_ids, 'count': len(block_ids)})
    return {'codebook': deepcopy(concepts), 'subjects': deepcopy(coding['subjects']),
            'modes': deepcopy(coding['modes']), 'records': records,
            'sections': sections, 'cells': cells,
            'coverage': {'classified_blocks': len({r['block_id'] for r in records}),
                         'body_blocks': len(body), 'records': len(records)},
            'method': coding['method'], 'limitation': coding['limitation']}
