#!/usr/bin/env python3
"""Build the complete static reading from verified analysis and editorial chapters."""
import html
import json
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
ARTICLE_URL = 'https://www.yin.roma.it/2026/10/whose-thinking-is-being-assessed-the-unsettled-boundary-between-assistance-and-authorship-in-ai-assisted-education/'

def e(value):
    return html.escape(str(value), quote=True)

def build():
    data = json.loads((SITE / 'data/analysis.json').read_text())
    chapters = json.loads((ROOT / 'data/edition-chapters.json').read_text())
    blocks = {b['id']: b for b in data['article']['blocks']}
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
        articles.append(f'<article class="episode" id="{e(c["id"])}" data-chapter="{i}" aria-labelledby="h-{e(c["id"])}"><p class="chapter-kicker">{e(c["kicker"])}</p><header class="sy-heading"><h2 id="h-{e(c["id"])}">{e(c["title"])}</h2></header><div class="sy-pages">{"".join(sides)}</div><div class="sy-note">{paragraphs}</div>{q}<div class="source-list" aria-label="Source paragraphs">{buttons}<button type="button" data-nodes="{e(",".join(c["node_ids"]))}">Interpretations</button></div><div class="mobile-map"></div></article>')
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
    payload={'analysis':data,'chapters':chapters}
    values={'OPTIONS':''.join(options),'CHAPTERS':''.join(articles),'ARTICLE':''.join(section_html),'ARTICLE_URL':ARTICLE_URL,'TERM_OPTIONS':terms,'DATA':json.dumps(payload,ensure_ascii=False).replace('<','\\u003c'),'NODE_COUNT':str(len(nodes)),'EDGE_COUNT':str(len(data['relations']))}
    page=(SITE/'edition-template.html').read_text()
    for key,value in values.items():page=page.replace('__'+key+'__',value)
    (SITE/'index.html').write_text(page)
    (SITE/'data/edition-chapters.json').write_text(json.dumps(chapters,ensure_ascii=False,indent=2)+'\n')
    print(f'Built {len(chapters)} reading chapters covering {len(nodes)} interpretations and {len(blocks)} source blocks.')

if __name__ == '__main__':build()
