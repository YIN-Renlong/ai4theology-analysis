"""Source integrity checks for the selected original exchanges."""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('inquiry_sources', ROOT / 'scripts/inquiry_sources.py')
SOURCES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCES)


class InquirySourcesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.record = json.loads((ROOT / 'data/inquiry-sources.json').read_text())
        article = json.loads((ROOT / 'site/data/analysis.json').read_text())
        cls.blocks = {b['id'] for b in article['article']['blocks']}

    def test_published_selection_is_consistent_and_keeps_the_same_message_recurrence(self):
        result = SOURCES.validate_sources(self.record, self.blocks)
        m60 = [e for e in result['excerpts'] if e['message_id'] == 'M60']
        self.assertEqual(len(m60), 2)
        self.assertEqual(m60[0]['message_sha256'], m60[1]['message_sha256'])
        self.assertLess(m60[0]['end'], m60[1]['start'])
        self.assertTrue(all(e['review_status'] == 'proposed_by_assistant' for e in result['excerpts']))

    def test_unknown_paragraph_and_reordered_exchanges_are_rejected(self):
        bad = copy.deepcopy(self.record)
        bad['excerpts'][0]['paragraph_ids'] = ['P999']
        with self.assertRaisesRegex(ValueError, 'Unknown published paragraph'):
            SOURCES.validate_sources(bad, self.blocks)
        bad = copy.deepcopy(self.record)
        bad['excerpts'].reverse()
        with self.assertRaisesRegex(ValueError, 'recorded export order'):
            SOURCES.validate_sources(bad, self.blocks)

    def test_private_export_is_checked_by_message_and_span_without_writing_it(self):
        original = 'Private prefix.\nA real contribution.\nPrivate suffix.'
        message = 'A real contribution.'
        start = original.index(message)
        record = {
            'version': 1, 'source': {'sha256': SOURCES.digest(original)},
            'excerpts': [{
                'id': 'M1-E1', 'message_id': 'M1', 'order': 1, 'actor': 'human',
                'text': 'real', 'start': 2, 'end': 6, 'text_sha256': SOURCES.digest('real'),
                'message_sha256': SOURCES.digest(message), 'source_message_start': start,
                'source_message_end': start + len(message), 'paragraph_ids': ['P001'],
                'review_status': 'proposed_by_assistant',
            }],
        }
        SOURCES.validate_sources(record, {'P001'}, original)
        record['excerpts'][0]['start'] = 3
        record['excerpts'][0]['end'] = 7
        with self.assertRaisesRegex(ValueError, 'does not match the original exchange'):
            SOURCES.validate_sources(record, {'P001'}, original)
        with self.assertRaisesRegex(ValueError, 'Private export does not match'):
            SOURCES.validate_sources(record, {'P001'}, original + ' changed')


if __name__ == '__main__':
    unittest.main()
