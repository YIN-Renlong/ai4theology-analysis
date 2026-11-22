#!/usr/bin/env python3
"""Build the complete static reading from verified analysis and editorial chapters."""
import html
import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from inquiry_sources import load_sources

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
ARTICLE_URL = 'https://www.yin.roma.it/2026/10/whose-thinking-is-being-assessed-the-unsettled-boundary-between-assistance-and-authorship-in-ai-assisted-education/'

def e(value):
    return html.escape(str(value), quote=True)

def build():
    data = json.loads((SITE / 'data/analysis.json').read_text())
    report = json.loads((SITE / 'data/collaboration-analysis.json').read_text())
    for key, path in {
        'analysis': SITE / 'data/analysis.json',
        'codebook': ROOT / 'data/collaboration-codebook.json',
        'episodes': ROOT / 'data/collaboration-episodes.json',
        'contextual': ROOT / 'data/contextual-codebook.json',
    }.items():
        if report['input_sha256'][key] != hashlib.sha256(path.read_bytes()).hexdigest():
            raise ValueError('Stale collaboration analysis: rerun scripts/analyze_collaboration.py')
    chapters = json.loads((ROOT / 'data/edition-chapters.json').read_text())
    blocks = {b['id']: b for b in data['article']['blocks']}
    inquiry = load_sources(ROOT, blocks)
    aligned_blocks = {p for item in inquiry['excerpts'] for p in item['paragraph_ids']}
    episode_index = {item['id']: item for item in report['episodes']}
    nodes = {n['id'] for n in data['nodes']}
    covered = set()
    options, articles = [], []
    ids = set()
    for i, c in enumerate(chapters):
        if c['id'] in ids or not c['id'].replace('-', '').isalnum():
            raise ValueError('Invalid or repeated chapter ID')
        ids.add(c['id'])
        if not set(c['source_ids']).issubset(blocks) or not set(c['node_ids']).issubset(nodes):
            raise ValueError('Unknown evidence reference in '+c['id'])
        covered.update(c['node_ids'])
        quote = c.get('quote')
        if quote and quote['text'] not in blocks[quote['source_id']]['text']:
            raise ValueError('Unmatched quotation in '+c['id'])
        options.append(f'<option value="{e(c["id"])}">{i+1}. {e(c["title"])}</option>')
        sides = []
        for side, title in [('left','First reading'), ('right','Alongside it')]:
            title = {'comparison': {'left':'Human advice','right':'AI advice'},'changed-case':{'left':'Original case','right':'Substitution'}}.get(c['id'],{}).get(side,title)
            cell = c[side]
            sides.append(f'<section class="sy-leaf"><div class="sy-page">{e(title)}</div><h3 data-ink>{e(cell["title"])}</h3><p>{e(cell["text"])}</p></section>')
        paragraphs=''.join(f'<p>{e(p)}</p>' for p in c['paragraphs'])
        q=f'<blockquote>{e(quote["text"])}<cite>From the essay · {e(quote["source_id"])}</cite></blockquote>' if quote else ''
        buttons=''.join(f'<button type="button" data-paragraph="{e(p)}">{e(p)}</button>' for p in c['source_ids'])
        if set(c['source_ids']) & aligned_blocks:
            buttons += f'<button type="button" data-alignment="{e(",".join(c["source_ids"]))}">Read the original exchange</button>'
        close_reading = []
        for episode_id in c.get('analysis_episode_ids', []):
            if episode_id not in episode_index:
                raise ValueError('Unknown focused episode: ' + episode_id)
            item = episode_index[episode_id]
            change = item['change']
            states = ''.join(f'<div><dt>{label}</dt><dd>{e(change[key].replace("_", " ").capitalize())}</dd></div>' for label, key in [('Conclusion', 'conclusion'), ('Justification', 'justification')])
            close_reading.append(f'<section class="chapter-analysis" aria-labelledby="analysis-{e(c["id"])}-{e(episode_id)}"><p class="analysis-status">Close reading · Proposed interpretation</p><h3 id="analysis-{e(c["id"])}-{e(episode_id)}">What changes here?</h3><dl class="chapter-change">{states}</dl><p>{e(change["explanation"])}</p><p class="pedagogical-question"><strong>For theological scholarship</strong> {e(item["pedagogical_question"])}</p></section>')
        if c.get('research_note'):
            note = c['research_note']
            if not set(note['source_ids']).issubset(blocks):
                raise ValueError('Unknown source for theological reading')
            refs = ''.join(f'<button type="button" data-paragraph="{e(p)}">{e(p)}</button>' for p in note['source_ids'])
            close_reading.append(f'<section class="chapter-analysis"><h3>{e(note["title"])}</h3><p>{e(note["text"])}</p><div class="source-list">{refs}</div></section>')
        articles.append(f'<article class="episode" id="{e(c["id"])}" data-chapter="{i}" aria-labelledby="h-{e(c["id"])}"><p class="chapter-kicker">{e(c["kicker"])}</p><header class="sy-heading"><h2 id="h-{e(c["id"])}">{e(c["title"])}</h2></header><div class="sy-pages">{"".join(sides)}</div><div class="sy-note">{paragraphs}</div>{q}<div class="source-list" aria-label="Source paragraphs">{buttons}<button type="button" data-nodes="{e(",".join(c["node_ids"]))}">Interpretations</button></div>{"".join(close_reading)}<div class="mobile-map"></div></article>')
    if covered != nodes:
        raise ValueError('Some analytical records are missing from the reading')
    section_html=[]
    current=[]
    title='Opening'
    def close_section():
        if current: section_html.append(f'<details class="article-section"><summary>{e(title)}</summary>'+''.join(current)+'</details>')
    for b in blocks.values():
        if b['kind']=='heading':
            close_section();current=[];title=b['text'];continue
        links=[]
        for l in b.get('links',[]):
            url=urljoin(ARTICLE_URL,l['url'])
            if urlparse(url).scheme in ('http','https'):
                links.append(f'<a href="{e(url)}" target="_blank" rel="noopener">{e(l["text"])}</a>')
        current.append(f'<div class="full-paragraph" id="text-{e(b["id"])}"><a class="para-ref" href="#text-{e(b["id"])}">{e(b["id"])}</a><span class="paragraph-text">{e(b["text"])}</span>'+ (f'<div class="article-links">{"".join(links)}</div>' if links else '')+'</div>')
    close_section()
    terms=''.join(f'<option value="{e(k)}">{e(k.capitalize())} · {v} matches</option>' for k,v in data['summary']['literal_term_occurrences'].items())
    payload={'analysis':data,'chapters':chapters,'collaboration':report,'inquiry':inquiry}
    values={'OPTIONS':''.join(options),'CHAPTERS':''.join(articles),'ARTICLE':''.join(section_html),'ARTICLE_URL':ARTICLE_URL,'TERM_OPTIONS':terms,'DATA':json.dumps(payload,ensure_ascii=False).replace('<','\\u003c'),'NODE_COUNT':str(len(nodes)),'EDGE_COUNT':str(len(data['relations']))}
    page=(SITE/'edition-template.html').read_text()
    count = report['counts']
    summary = '<p class="note">'+e(f"{count['episodes']} selected episodes · {count['patterns']} candidate patterns · {count['annotated_body_blocks']} of {count['body_blocks']} body blocks contain analytical anchors. Pattern assignments remain proposed interpretations.")+'</p>'
    page = page.replace('__ANALYSIS_SUMMARY__', summary)
    context = report['contextual']
    coverage = context['coverage']
    context_summary = '<p class="note">' + e(f"{coverage['records']} selected contextual readings across {coverage['classified_blocks']} of {coverage['body_blocks']} body passages. Classifications remain proposed interpretations.") + '</p><table><thead><tr><th>Concept in context</th><th>Selected passages</th></tr></thead><tbody>'
    for concept in context['codebook']:
        total = sum(cell['count'] for cell in context['cells'] if cell['concept_id'] == concept['id'])
        context_summary += '<tr><th>' + e(concept['label']) + '</th><td>' + str(total) + '</td></tr>'
    context_summary += '</tbody></table><p><a href="data/contextual-readings.csv">Read the contextual interpretations and source excerpts</a></p>'
    page = page.replace('__CONTEXT_SUMMARY__', context_summary)
    # A readable evidence appendix remains available without JavaScript.
    appendix = ['<details class="source-archive"><summary>Read the selected original exchanges</summary><p class="note">' + e(inquiry['source']['chronology_note']) + '</p>']
    for item in inquiry['excerpts']:
        who = 'YIN Renlong' if item['actor'] == 'human' else 'AI assistant'
        linked = ' · '.join(f'<a href="#text-{e(p)}">{e(p)}</a>' for p in item['paragraph_ids'])
        appendix.append(f'<section class="alignment-source" id="source-{e(item["id"])}"><h3>{e(item["message_id"])} · {who}</h3><p>{e(item.get("display_text", item["text"]))}</p><details><summary>Original wording</summary><p>{e(item["text"])}</p></details><p class="note">{e(item["alignment_note"])}</p><p class="note">Published passages: {linked}</p></section>')
    appendix.append('</details>')
    page = page.replace('__SOURCE_APPENDIX__', ''.join(appendix))
    for key,value in values.items():page=page.replace('__'+key+'__',value)
    (SITE/'index.html').write_text(page)
    (SITE/'data/edition-chapters.json').write_text(json.dumps(chapters,ensure_ascii=False,indent=2)+'\n')
    (SITE/'data/inquiry-sources.json').write_text(json.dumps(inquiry,ensure_ascii=False,indent=2)+'\n')
    print(f'Built {len(chapters)} reading chapters covering {len(nodes)} interpretations and {len(blocks)} source blocks.')

if __name__ == '__main__':build()
