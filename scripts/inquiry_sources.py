"""Validate the public excerpt selection, optionally against the private chat export.

Only scoped excerpts are published. The complete export is never copied to site/.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def validate_sources(record, block_ids, source_text=None):
    if record.get('version') != 1:
        raise ValueError('Unsupported inquiry source version')
    source = record.get('source', {})
    if not re.fullmatch(r'[a-f0-9]{64}', source.get('sha256', '')):
        raise ValueError('Missing source archive fingerprint')
    if source_text is not None and digest(source_text) != source['sha256']:
        raise ValueError('Private export does not match the recorded fingerprint')
    seen = set()
    previous = None
    for entry in record.get('excerpts', []):
        identity = entry.get('id', '')
        if not re.fullmatch(r'M\d+-E\d+', identity) or identity in seen:
            raise ValueError('Invalid or duplicate excerpt ID')
        seen.add(identity)
        message_id = entry.get('message_id', '')
        if not re.fullmatch(r'M\d+', message_id):
            raise ValueError('Invalid message ID')
        if entry.get('actor') not in ('human', 'assistant'):
            raise ValueError('Unknown source actor')
        start, end = entry.get('start'), entry.get('end')
        if type(start) is not int or type(end) is not int or start < 0 or end <= start:
            raise ValueError('Invalid source offsets')
        text = entry.get('text', '')
        if len(text) != end - start or digest(text) != entry.get('text_sha256'):
            raise ValueError('Excerpt does not match its length or fingerprint')
        if not entry.get('display_text', text).strip():
            raise ValueError('Empty display excerpt')
        if not re.fullmatch(r'[a-f0-9]{64}', entry.get('message_sha256', '')):
            raise ValueError('Missing original message fingerprint')
        if not entry.get('paragraph_ids') or not set(entry['paragraph_ids']).issubset(block_ids):
            raise ValueError('Unknown published paragraph in source alignment')
        if entry.get('review_status') not in ('proposed_by_assistant', 'reviewed_by_author', 'revised_by_author', 'unresolved'):
            raise ValueError('Unknown interpretation review status')
        order = entry.get('order')
        if type(order) is not int or order != int(message_id[1:]):
            raise ValueError('Message order disagrees with export identifier')
        key = (order, start)
        if previous is not None and key < previous:
            raise ValueError('Excerpts must follow their recorded export order')
        previous = key
        if source_text is not None:
            message = source_text[entry['source_message_start']:entry['source_message_end']]
            if digest(message) != entry['message_sha256'] or message[start:end] != text:
                raise ValueError('Excerpt does not match the original exchange: ' + identity)
    if not seen:
        raise ValueError('No original excerpts supplied')
    return record


def load_sources(root, blocks):
    record = json.loads((root / 'data/inquiry-sources.json').read_text(encoding='utf-8'))
    return validate_sources(record, set(blocks))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='Optional original UTF-8 chat export; read locally only')
    args = parser.parse_args()
    record = json.loads((ROOT / 'data/inquiry-sources.json').read_text(encoding='utf-8'))
    article = json.loads((ROOT / 'site/data/analysis.json').read_text(encoding='utf-8'))
    original = args.source.read_bytes().decode('utf-8') if args.source else None
    validate_sources(record, {b['id'] for b in article['article']['blocks']}, original)
    scope = 'against the original export' if original is not None else 'for internal consistency'
    print(f"Verified {len(record['excerpts'])} selected excerpts {scope}. No source files were published.")


if __name__ == '__main__':
    main()
