"""Regression checks for complete, safe rendering of the research record."""
import contextlib
import copy
import importlib.util
import io
import json
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('build_edition', ROOT / 'scripts/build_edition.py')
BUILD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)


class EditionHTML(HTMLParser):
    """Read displayed text and the payload without executing browser code."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.paragraphs = {}
        self.headings = []
        self.payload = ''
        self.tags = []
        self.paragraph_id = None
        self.in_paragraph = False
        self.in_heading = False
        self.in_payload = False
        self.in_article_section = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        classes = attrs.get('class', '').split()
        if tag == 'div' and 'full-paragraph' in classes:
            self.paragraph_id = attrs['id'].removeprefix('text-')
        if tag == 'span' and 'paragraph-text' in classes:
            self.in_paragraph = True
            self.paragraphs[self.paragraph_id] = ''
        if tag == 'details' and 'article-section' in classes:
            self.in_article_section = True
        if tag == 'summary' and self.in_article_section:
            self.in_heading = True
            self.headings.append('')
        if tag == 'script' and attrs.get('id') == 'edition-data':
            self.in_payload = True

    def handle_data(self, data):
        if self.in_paragraph:
            self.paragraphs[self.paragraph_id] += data
        if self.in_heading:
            self.headings[-1] += data
        if self.in_payload:
            self.payload += data

    def handle_endtag(self, tag):
        if tag == 'span':
            self.in_paragraph = False
        if tag == 'summary':
            self.in_heading = False
        if tag == 'details':
            self.in_article_section = False
        if tag == 'script':
            self.in_payload = False


class EditionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.analysis = json.loads((ROOT / 'site/data/analysis.json').read_text())
        cls.chapters = json.loads((ROOT / 'data/edition-chapters.json').read_text())
        cls.template = (ROOT / 'site/edition-template.html').read_text()

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.site = self.root / 'site'
        (self.site / 'data').mkdir(parents=True)
        (self.root / 'data').mkdir()
        (self.site / 'edition-template.html').write_text(self.template)
        self.root_patch = patch.object(BUILD, 'ROOT', self.root)
        self.site_patch = patch.object(BUILD, 'SITE', self.site)
        self.root_patch.start()
        self.site_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.addCleanup(self.site_patch.stop)

    def write_inputs(self, analysis=None, chapters=None):
        (self.site / 'data/analysis.json').write_text(json.dumps(self.analysis if analysis is None else analysis))
        (self.root / 'data/edition-chapters.json').write_text(json.dumps(self.chapters if chapters is None else chapters))

    def build(self):
        with contextlib.redirect_stdout(io.StringIO()):
            BUILD.build()
        result = EditionHTML()
        result.feed((self.site / 'index.html').read_text())
        return result

    def test_complete_article_and_analytical_record_survive_rendering(self):
        self.write_inputs()
        page = self.build()
        blocks = self.analysis['article']['blocks']
        self.assertEqual(len(blocks), 157)
        self.assertEqual(page.paragraphs, {b['id']: b['text'] for b in blocks if b['kind'] != 'heading'})
        self.assertEqual(page.headings, [b['text'] for b in blocks if b['kind'] == 'heading'])
        payload = json.loads(page.payload)
        self.assertEqual(payload['analysis'], self.analysis)
        self.assertEqual(payload['chapters'], self.chapters)
        expected_nodes = {n['id'] for n in self.analysis['nodes']}
        self.assertEqual(len(expected_nodes), 25)
        self.assertEqual({n for c in payload['chapters'] for n in c['node_ids']}, expected_nodes)
        for chapter in payload['chapters']:
            for source_id in chapter['source_ids']:
                self.assertIn(source_id, {b['id'] for b in blocks})

    def test_article_text_cannot_become_html_or_break_the_json_payload(self):
        analysis = copy.deepcopy(self.analysis)
        attack = '<script data-injected="yes">alert(1)</script><img data-injected="yes" src=x onerror=alert(2)>& "literal text"'
        block = next(b for b in analysis['article']['blocks'] if b['id'] == 'P005')
        block['text'] += attack
        block['links'] = [
            {'url': 'javascript:alert(1)', 'text': 'untrusted link'},
            {'url': '#ref-safe', 'text': '<img data-injected="yes" src=x>'},
        ]
        chapters = copy.deepcopy(self.chapters)
        chapters[0]['paragraphs'][0] += attack
        self.write_inputs(analysis, chapters)
        page = self.build()
        self.assertEqual(page.paragraphs['P005'], block['text'])
        self.assertEqual(json.loads(page.payload)['analysis'], analysis)
        self.assertEqual(json.loads(page.payload)['chapters'], chapters)
        self.assertFalse(any('data-injected' in attrs for _, attrs in page.tags))
        hrefs = [attrs['href'] for _, attrs in page.tags if 'href' in attrs]
        self.assertFalse(any(href.lower().startswith('javascript:') for href in hrefs))
        self.assertIn(BUILD.ARTICLE_URL + '#ref-safe', hrefs)

    def test_invalid_evidence_is_rejected_before_existing_page_is_replaced(self):
        cases = {}
        unknown_node = copy.deepcopy(self.chapters)
        unknown_node[0]['node_ids'].append('A999')
        cases['unknown analytical node'] = unknown_node
        unknown_source = copy.deepcopy(self.chapters)
        unknown_source[0]['source_ids'].append('P999')
        cases['unknown source block'] = unknown_source
        false_quote = copy.deepcopy(self.chapters)
        false_quote[0]['quote']['text'] = 'This quotation does not occur in the source article.'
        cases['fabricated quotation'] = false_quote
        missing_node = copy.deepcopy(self.chapters)
        for chapter in missing_node:
            chapter['node_ids'] = [n for n in chapter['node_ids'] if n != 'A01']
        cases['dropped analytical node'] = missing_node
        for label, chapters in cases.items():
            with self.subTest(label=label):
                self.write_inputs(chapters=chapters)
                (self.site / 'index.html').write_text('previous verified page')
                with self.assertRaises(ValueError):
                    self.build()
                self.assertEqual((self.site / 'index.html').read_text(), 'previous verified page')


if __name__ == '__main__':
    unittest.main()
