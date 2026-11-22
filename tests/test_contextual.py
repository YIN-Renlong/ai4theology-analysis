"""Ensure contextual counts are grounded in supplied, unambiguous readings."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from contextual_analysis import contextual_analysis


class ContextualTests(unittest.TestCase):
    def setUp(self):
        self.blocks = [
            {'id': 'P1', 'kind': 'paragraph', 'section': 'Opening', 'text': 'I can explain the reason.'},
            {'id': 'P2', 'kind': 'paragraph', 'section': 'Return', 'text': 'The model supplies fluent wording.'},
            {'id': 'R1', 'kind': 'paragraph', 'section': 'References', 'text': 'I can explain the reason.', 'is_reference': True},
        ]
        self.coding = {
            'version': 1, 'method': 'Proposed contextual readings.', 'limitation': 'Selected, not exhaustive.',
            'codebook': [{'id': 'understanding', 'label': 'Understanding', 'definition': 'Explain a reason.'},
                         {'id': 'contribution', 'label': 'Contribution', 'definition': 'A contribution to reasoning.'}],
            'subjects': {'learner': 'The learner'}, 'modes': {'conceptual_argument': 'Conceptual argument'},
            'records': [{'id': 'C1', 'block_id': 'P1', 'concept_id': 'understanding', 'subject': 'learner',
                         'mode': 'conceptual_argument', 'quote': 'explain the reason',
                         'interpretation': 'A proposed indicator.', 'review_status': 'proposed_by_assistant'}],
        }

    def test_overlapping_concepts_count_one_covered_passage(self):
        self.coding['records'].append({**self.coding['records'][0], 'id': 'C2', 'concept_id': 'contribution'})
        before = deepcopy((self.blocks, self.coding))
        result = contextual_analysis(self.blocks, self.coding)
        self.assertEqual(result['coverage'], {'classified_blocks': 1, 'body_blocks': 2, 'records': 2})
        self.assertEqual(sum(c['count'] for c in result['cells']), 2)
        self.assertEqual(len(result['sections']), 2)
        self.assertEqual([c['count'] for c in result['cells'] if c['section_id'] == 'S02'], [0, 0])
        for record in result['records']:
            span = record['evidence']
            self.assertEqual(self.blocks[0]['text'][span['start']:span['end']], span['quote'])
        self.assertEqual(before, (self.blocks, self.coding))

    def test_missing_and_ambiguous_quotations_rejected(self):
        for text in ('This has no match.', 'explain the reason and explain the reason'):
            with self.subTest(text=text):
                self.blocks[0]['text'] = text
                with self.assertRaisesRegex(ValueError, 'Missing or ambiguous'):
                    contextual_analysis(self.blocks, self.coding)

    def test_reference_and_unknown_classifications_rejected(self):
        for field, value, message in [('block_id', 'R1', 'Unknown contextual passage'),
                                      ('subject', 'invented', 'Unknown contextual subject'),
                                      ('mode', 'measured_learning', 'Unknown contextual subject')]:
            with self.subTest(field=field):
                coding = deepcopy(self.coding)
                coding['records'][0][field] = value
                with self.assertRaisesRegex(ValueError, message):
                    contextual_analysis(self.blocks, coding)

    def test_duplicate_assignment_cannot_inflate_count(self):
        self.coding['records'].append({**self.coding['records'][0], 'id': 'C2'})
        with self.assertRaisesRegex(ValueError, 'Duplicate concept assignment'):
            contextual_analysis(self.blocks, self.coding)


if __name__ == '__main__':
    unittest.main()
