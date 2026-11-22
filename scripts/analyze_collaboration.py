#!/usr/bin/env python3
"""Compute descriptive collaboration analysis from a source-linked provisional codebook.

No language-model calls or third-party Python dependencies are used. Episode codes
are supplied interpretations; this program validates, aggregates and queries them.
"""
import argparse
from collections import Counter, deque
from copy import deepcopy
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import tempfile
import unicodedata
from contextual_analysis import contextual_analysis

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.2.0"
BASIS = {"retrospective_account", "later_literature", "hypothetical_example", "published_argument"}
CONCLUSIONS = {"retained", "revised", "unresolved", "not_established"}
JUSTIFICATIONS = {"elaborated", "qualified", "repaired", "not_established"}
SEQUENCES = {"reported_order", "analytical_grouping", "hypothetical"}
ACTORS = {"author", "assistant", "source"}
FAMILY_LABELS = {"argument": "Argument and reference", "interaction": "Interaction responses", "reported_sequence": "Reported sequence"}
# This explicit list is part of the reproducible lexical method. No stemming,
# embeddings, synonym expansion or language-model classification is performed.
STOPWORDS = frozenset("""a about above after again against all also am an and any are as at be because been before being below between both but by can cannot could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up us very was we were what when where which while who whom why will with would you your yours yourself yourselves may might must one two whether even much many however although within without whose shall indeed thus therefore""".split())
TOKEN_PATTERN = re.compile(r"[a-z]+(?:'[a-z]+)?")
LEXICAL_OPTIONS = {"min_paragraph_words": 25, "min_body_index_distance": 3,
                   "top_pairs": 12, "minimum_cosine": 0.1, "shared_terms_limit": 8}


def text_tokens(text):
    text = unicodedata.normalize("NFKC", text).lower().replace("’", "'")
    return TOKEN_PATTERN.findall(text)


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def unique_index(items, label):
    if not isinstance(items, list):
        raise ValueError(label + " must be a list")
    result = {}
    for item in items:
        identifier = item.get("id")
        if not isinstance(identifier, str) or not identifier or identifier in result:
            raise ValueError("Invalid or duplicate " + label + " ID")
        result[identifier] = item
    return result


def require_text(item, keys, label):
    for key in keys:
        if not isinstance(item.get(key), str) or not item[key].strip():
            raise ValueError(label + " needs nonempty " + key)


def references(values, allowed, label, nonempty=False):
    if not isinstance(values, list) or (nonempty and not values):
        raise ValueError(label + " must be a" + (" nonempty" if nonempty else "") + " list")
    if len(values) != len(set(values)) or any(value not in allowed for value in values):
        raise ValueError("Unknown or duplicate reference in " + label)


def validate(analysis, codebook, episode_data):
    blocks = unique_index(analysis["article"]["blocks"], "block")
    nodes = unique_index(analysis["nodes"], "node")
    relations = unique_index(analysis["relations"], "relation")
    patterns = unique_index(codebook["patterns"], "pattern")
    episodes = unique_index(episode_data["episodes"], "episode")
    if analysis.get("unresolved_anchors"):
        raise ValueError("Source analysis contains unresolved anchors")
    for block in blocks.values():
        require_text(block, ("text", "kind", "section"), block["id"])
    for item in [*nodes.values(), *relations.values()]:
        evidence = item.get("evidence", {})
        if evidence.get("status") != "matched" or not evidence.get("spans"):
            raise ValueError("Missing matched evidence: " + item["id"])
        for span in evidence["spans"]:
            block = blocks.get(span.get("block_id"))
            start, end, quote = span.get("start"), span.get("end"), span.get("quote")
            if (block is None or block.get("is_reference") or block["kind"] == "heading"
                    or type(start) is not int or type(end) is not int
                    or start < 0 or end <= start or end > len(block["text"])
                    or not isinstance(quote, str) or not quote
                    or block["text"][start:end] != quote):
                raise ValueError("Invalid source span: " + item["id"])
        if item.get("anchor") != evidence["spans"][0]["quote"]:
            raise ValueError("Anchor and span differ: " + item["id"])
    for node in nodes.values():
        if node.get("record_basis") not in BASIS or node.get("actor_as_reported") not in ACTORS:
            raise ValueError("Unknown node evidence basis or reported actor: " + node["id"])
    for relation in relations.values():
        if relation.get("source") not in nodes or relation.get("target") not in nodes:
            raise ValueError("Unknown relation endpoint: " + relation["id"])
        if relation.get("eligible_for_graph") is not True:
            raise ValueError("This analysis requires all input relations to be graph-eligible")
    families = codebook.get("relation_families", {})
    if set(families) != set(FAMILY_LABELS):
        raise ValueError("Relation family keys must be argument, interaction and reported_sequence")
    assigned = []
    for family, kinds in families.items():
        if not isinstance(kinds, list):
            raise ValueError("Relation family must contain a list: " + family)
        assigned.extend(kinds)
    relation_types = {relation["type"] for relation in relations.values()}
    if len(assigned) != len(set(assigned)) or set(assigned) != relation_types:
        raise ValueError("Codebook must partition every relationship type exactly once")
    for pattern in patterns.values():
        require_text(pattern, ("label", "definition", "inclusion", "exclusion", "pedagogical_question"), pattern["id"])
    for episode in episodes.values():
        identifier = episode["id"]
        require_text(episode, ("title", "summary", "pedagogical_question", "limit", "review_status"), identifier)
        if episode.get("basis") not in BASIS or episode.get("sequence_status") not in SEQUENCES:
            raise ValueError("Unknown episode basis or sequence status: " + identifier)
        if episode["basis"] == "hypothetical_example" and episode["sequence_status"] != "hypothetical":
            raise ValueError("Hypothetical episode must retain hypothetical order: " + identifier)
        references(episode.get("node_ids"), nodes, identifier + " nodes", True)
        references(episode.get("pattern_ids"), patterns, identifier + " patterns", True)
        moves = episode.get("moves")
        if not isinstance(moves, list) or not moves:
            raise ValueError("Episode needs evidence-linked moves: " + identifier)
        for move in moves:
            if move.get("actor") not in ACTORS:
                raise ValueError("Unknown move actor: " + identifier)
            require_text(move, ("action",), identifier + " move")
            references(move.get("node_ids"), set(episode["node_ids"]), identifier + " move nodes", True)
        change = episode.get("change", {})
        if change.get("conclusion") not in CONCLUSIONS or change.get("justification") not in JUSTIFICATIONS:
            raise ValueError("Unknown change state: " + identifier)
        require_text(change, ("explanation",), identifier + " change")
        for key in ("earlier_node_ids", "later_node_ids"):
            references(change.get(key), set(episode["node_ids"]), identifier + " " + key)
        if (change["conclusion"] != "not_established" or change["justification"] != "not_established") and not change["later_node_ids"]:
            raise ValueError("A proposed change needs later evidence: " + identifier)
    return blocks, nodes, relations, patterns, episodes


def graph_paths(nodes, relations):
    """One shortest path per reachable pair, following annotated edge direction.

The BFS is purely structural; it does not interpret path labels as transitive
inference or as a historical/causal sequence. Cycles are handled explicitly.
"""
    adjacency = {node["id"]: [] for node in nodes}
    for relation in sorted(relations, key=lambda item: item["id"]):
        adjacency[relation["source"]].append((relation["target"], relation["id"]))
    paths = []
    for source in sorted(adjacency):
        seen = {source}
        queue = deque([(source, [source], [])])
        while queue:
            current, node_ids, relation_ids = queue.popleft()
            for target, edge in adjacency[current]:
                if target in seen:
                    continue
                seen.add(target)
                next_nodes, next_relations = node_ids + [target], relation_ids + [edge]
                paths.append({"source": source, "target": target,
                              "node_ids": next_nodes, "relation_ids": next_relations})
                queue.append((target, next_nodes, next_relations))
    return paths


def graph_motifs(nodes, relations):
    """Find explicitly defined configurations in the supplied annotated graph.

    These rules operate on interpreted labels, not on unclassified prose. The
    recurrence rule requires its reported-sequence edge, so acknowledgment alone
    can never be reported as a sustained repair or as a learning outcome.
    """
    indexed = {node["id"]: node for node in nodes}
    kinds = {}
    for relation in sorted(relations, key=lambda item: item["id"]):
        kinds.setdefault(relation["type"], []).append(relation)
    recurrence, qualification, alternative = [], [], []
    for challenge in kinds.get("questions_relevance_of", []):
        challenge_id, claim_id = challenge["source"], challenge["target"]
        if indexed[challenge_id].get("actor_as_reported") != "author":
            continue
        for acknowledgment in kinds.get("acknowledges", []):
            acknowledgment_id = acknowledgment["source"]
            if acknowledgment["target"] != challenge_id or indexed[acknowledgment_id].get("actor_as_reported") != "assistant":
                continue
            for return_edge in kinds.get("returns_to", []):
                returned_id = return_edge["source"]
                if return_edge["target"] != challenge_id or indexed[returned_id].get("actor_as_reported") != "author":
                    continue
                for after in kinds.get("follows_acknowledgment_in_account", []):
                    node_ids = [claim_id, challenge_id, acknowledgment_id, returned_id]
                    if (after["source"] == returned_id and after["target"] == acknowledgment_id
                            and len(set(node_ids)) == 4
                            and all(indexed[node_id].get("record_basis") == "retrospective_account" for node_id in node_ids)):
                        recurrence.append({"node_ids": node_ids,
                                           "relation_ids": [challenge["id"], acknowledgment["id"], return_edge["id"], after["id"]]})
    for relation in kinds.get("qualifies", []):
        if indexed[relation["source"]].get("record_basis") == "later_literature":
            qualification.append({"node_ids": [relation["target"], relation["source"]], "relation_ids": [relation["id"]]})
    for offered in kinds.get("offers_alternative_to", []):
        for misapplication in kinds.get("illustrates_misapplication", []):
            if offered["target"] == misapplication["source"]:
                node_ids = [misapplication["target"], misapplication["source"], offered["source"]]
                if len(set(node_ids)) == 3:
                    alternative.append({"node_ids": node_ids, "relation_ids": [misapplication["id"], offered["id"]]})
    specifications = [
        ("repair_recurrence", "An objection returns after acknowledgment", recurrence,
         "Four distinct retrospective nodes: an author questions a claim's relevance; an assistant acknowledges that challenge; an author returns to it; an explicit follows-acknowledgment edge connects that return to the acknowledgment.",
         "The match depends on the article's reported sequence and the proposed coding. The rule does not itself establish sustained correction or learning; the separately aligned original excerpts must be inspected alongside it."),
        ("scholarly_qualification", "Later scholarship qualifies a claim", qualification,
         "A qualifies edge begins at a node whose evidence basis is later_literature.",
         "This detects a coded qualification. It does not establish when the original conversation occurred or that the writer's understanding improved."),
        ("alternative_to_misapplication", "An alternative addresses a misapplication", alternative,
         "An offers_alternative_to edge targets the source of an illustrates_misapplication edge; all three nodes must differ.",
         "The current match belongs to a hypothetical example. It is an argument configuration, not an observed learner outcome.")]
    output = []
    for identifier, label, matches, definition, limitation in specifications:
        unique = {tuple(match["relation_ids"]): match for match in matches}
        matches = [unique[key] for key in sorted(unique)]
        output.append({"id": identifier, "label": label, "definition": definition,
                       "matches": matches, "count": len(matches), "limitation": limitation})
    return output


def lexical_returns(blocks, options=None):
    options = dict(LEXICAL_OPTIONS if options is None else options)
    body = [block for block in blocks if not block.get("is_reference") and block["kind"] != "heading"]
    documents = []
    for position, block in enumerate(body):
        raw_tokens = text_tokens(block["text"])
        if len(raw_tokens) < options["min_paragraph_words"]:
            continue
        terms = Counter(token for token in raw_tokens if len(token) > 2 and token not in STOPWORDS)
        if terms:
            documents.append({"block_id": block["id"], "position": position, "terms": terms})
    frequency = Counter(term for doc in documents for term in doc["terms"])
    n = len(documents)
    for doc in documents:
        vector = {term: (1 + math.log(count)) * (math.log((1 + n) / (1 + frequency[term])) + 1)
                  for term, count in doc["terms"].items()}
        norm = math.sqrt(sum(weight * weight for weight in vector.values()))
        doc["vector"] = {term: weight / norm for term, weight in vector.items()}
    pairs = []
    matrix = [[0.0 for _ in documents] for _ in documents]
    for i, doc in enumerate(documents):
        matrix[i][i] = 1.0 if doc['vector'] else 0.0
    for i, first in enumerate(documents):
        for j in range(i + 1, len(documents)):
            second = documents[j]
            common = set(first["vector"]) & set(second["vector"])
            products = {term: first["vector"][term] * second["vector"][term] for term in sorted(common)}
            score = min(1.0, max(0.0, sum(products.values())))
            matrix[i][j] = matrix[j][i] = round(score, 6)
            if second["position"] - first["position"] < options["min_body_index_distance"]:
                continue
            if score < options["minimum_cosine"]:
                continue
            shared = sorted(products, key=lambda term: (-products[term], term))[:options["shared_terms_limit"]]
            pairs.append({"earlier_id": first["block_id"], "later_id": second["block_id"],
                          "score": round(score, 6), "shared_terms": shared})
    pairs.sort(key=lambda pair: (-pair["score"], pair["earlier_id"], pair["later_id"]))
    return {"method": "Paragraph retrieval using logarithmic term frequency, smoothed inverse document frequency and cosine similarity.",
            "limitations": "Earlier and later mean positions in the published article. Lexical similarity identifies candidate passages to inspect; it does not establish a return in the conversation, semantic agreement, or learning.",
            "options": {**options, "token_pattern": TOKEN_PATTERN.pattern, "normalization": "Unicode NFKC; lowercase; curly apostrophe to ASCII", "minimum_token_length": 3,
                        "tf": "1 + ln(term count)", "idf": "1 + ln((1 + document count) / (1 + document frequency))", "stopwords": sorted(STOPWORDS), "stemming": False},
            "eligible_paragraphs": n, "eligible_pairs_above_threshold": len(pairs),
            "matrix": {"block_ids": [doc['block_id'] for doc in documents], "values": matrix,
                       "metric": "TF–IDF cosine similarity",
                       "note": "The matrix includes all eligible passage pairs, including neighbours. The diagonal is self-comparison. Axes follow published-text order. Scores describe shared weighted vocabulary; they do not establish agreement, semantic equivalence or learning."},
            "pairs": pairs[:options["top_pairs"]]}


def analyze(analysis, codebook, episode_data, hashes=None):
    blocks, nodes, relations, patterns, episodes = validate(analysis, codebook, episode_data)
    block_order = {identifier: i for i, identifier in enumerate(blocks)}
    output_episodes = []
    for episode in episodes.values():
        enriched = deepcopy(episode)
        enriched["source_ids"] = sorted({span["block_id"] for node_id in episode["node_ids"]
                                         for span in nodes[node_id]["evidence"]["spans"]}, key=block_order.get)
        output_episodes.append(enriched)
    output_patterns = []
    for pattern in patterns.values():
        member_ids = [episode["id"] for episode in output_episodes if pattern["id"] in episode["pattern_ids"]]
        output_patterns.append({**deepcopy(pattern), "episode_ids": member_ids, "count": len(member_ids)})
    family_for_type = {kind: family for family, kinds in codebook["relation_families"].items() for kind in kinds}
    family_rows = []
    for family in FAMILY_LABELS:
        member_ids = [relation["id"] for relation in relations.values() if family_for_type[relation["type"]] == family]
        family_rows.append({"id": family, "label": FAMILY_LABELS[family], "count": len(member_ids), "relation_ids": member_ids})
    type_rows = []
    for kind in sorted(family_for_type):
        member_ids = [relation["id"] for relation in relations.values() if relation["type"] == kind]
        type_rows.append({"type": kind, "family": family_for_type[kind], "count": len(member_ids), "relation_ids": member_ids})
    coverage = []
    for block in blocks.values():
        if block.get("is_reference") or block["kind"] == "heading":
            continue
        node_ids = [node["id"] for node in nodes.values() if any(span["block_id"] == block["id"] for span in node["evidence"]["spans"])]
        relation_ids = [relation["id"] for relation in relations.values() if any(span["block_id"] == block["id"] for span in relation["evidence"]["spans"])]
        coverage.append({"block_id": block["id"], "section": block["section"], "annotated": bool(node_ids or relation_ids),
                         "node_ids": node_ids, "relation_ids": relation_ids})
    basis_rows = []
    for basis in sorted(BASIS):
        member_ids = [node["id"] for node in nodes.values() if node["record_basis"] == basis]
        basis_rows.append({"basis": basis, "count": len(member_ids), "node_ids": member_ids})
    changes = []
    states = sorted({(episode["change"]["conclusion"], episode["change"]["justification"]) for episode in output_episodes})
    for conclusion, justification in states:
        member_ids = [episode["id"] for episode in output_episodes if (episode["change"]["conclusion"], episode["change"]["justification"]) == (conclusion, justification)]
        changes.append({"conclusion": conclusion, "justification": justification, "count": len(member_ids), "episode_ids": member_ids})
    return {"schema_version": 1, "analysis_version": VERSION, "input_sha256": hashes or {},
            "counts": {"body_blocks": len(coverage), "annotated_body_blocks": sum(row["annotated"] for row in coverage),
                       "nodes": len(nodes), "relations": len(relations), "relation_types": len(type_rows), "episodes": len(episodes),
                       "patterns": len(patterns), "unresolved_anchors": 0},
            "patterns": output_patterns, "episodes": output_episodes, "relation_families": family_rows,
            "relation_types": type_rows, "coverage": coverage, "evidence_basis": basis_rows, "changes": changes,
            "graph": {"node_count": len(nodes), "edge_count": len(relations), "paths": graph_paths(list(nodes.values()), list(relations.values())),
                      "motifs": graph_motifs(list(nodes.values()), list(relations.values())),
                      "method": "Breadth-first search; one shortest directed path for each reachable ordered node pair; ties resolved by relationship ID.",
                      "limitations": "These paths follow annotated relationships. Their heterogeneous labels are not automatically transitive, chronological or causal."},
            "lexical_returns": lexical_returns(list(blocks.values())),
            "method": {"scope": "One published article; selected provisional coding. Scoped original exchanges are aligned separately in the reader; these counts and graph queries still describe the article-based coding.",
                       "pattern_counts": "Counts aggregate supplied episode codes; they are not automatically discovered collaboration types. An episode can have multiple codes, so counts can exceed the number of episodes.",
                       "changes": "Conclusion and justification states are assistant-proposed interpretations, not measured learning outcomes. Not established means the available episode does not demonstrate that change.",
                       "coverage": "A body block is a non-reference paragraph or quotation. Coverage counts blocks containing at least one node or relation anchor; unannotated blocks were not necessarily irrelevant.",
                       "evidence_basis": "Basis distributions count selected interpretation nodes, not people, authorship shares or independent observations.",
                       "sequence": "Reported order, hypothetical order and analytical grouping remain distinct. No conversational transition probabilities or durations are inferred from article order.",
                       "review_status": "proposed_by_assistant", "computational_role": "Python validates text offsets, aggregates codes, traverses the directed graph and retrieves lexical similarities. The codebook and episode interpretations are supplied inputs."}}


def safe_csv_value(value):
    value = str(value)
    if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) or value.startswith(("\t", "\r", "\n")):
        return "'" + value
    return value


def csv_text(fieldnames, rows):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: safe_csv_value(row.get(key, "")) for key in fieldnames})
    return stream.getvalue()


def render_report(result):
    counts = result["counts"]
    lines = ["# Collaboration analysis", "", "Generated reproducibly by `scripts/analyze_collaboration.py` (" + VERSION + ").", "",
             "This is a descriptive analysis of selected assistant-proposed annotations in one published article. It is not a measurement of learning or a complete conversation history.", "", "## Verified counts", "",
             "| Unit | Count |", "| --- | ---: |"]
    lines.extend("| " + name.replace("_", " ") + " | " + str(value) + " |" for name, value in counts.items())
    lines += ["", "## Candidate patterns", "", "Counts refer to the supplied episode annotations. Episodes may receive multiple pattern codes.", "", "| Pattern | Episodes | Count |", "| --- | --- | ---: |"]
    lines.extend("| " + pattern["label"] + " | " + ", ".join(pattern["episode_ids"]) + " | " + str(pattern["count"]) + " |" for pattern in result["patterns"])
    lines += ["", "## Proposed changes in expressed reasoning", ""]
    for episode in result["episodes"]:
        change = episode["change"]
        lines += ["### " + episode["id"] + " · " + episode["title"], "", "Evidence basis: " + episode["basis"] + "; sequence: " + episode["sequence_status"] + ".", "",
                  "Conclusion: **" + change["conclusion"] + "**. Justification: **" + change["justification"] + "**.", "", change["explanation"], "", "Evidence: " + ", ".join(episode["source_ids"]) + ".", "", "Limit: " + episode["limit"], ""]
    lines += ["## Graph queries", "", str(len(result["graph"]["paths"])) + " reachable ordered node pairs. " + result["graph"]["method"], "", result["graph"]["limitations"], "",
              "## Explicit structural queries", "", "These rules search the supplied interpreted graph; they do not independently classify the article.", ""]
    for motif in result["graph"]["motifs"]:
        lines += ["### " + motif["label"], "", motif["definition"], "", "Matches: " + str(motif["count"]) + ". " + motif["limitation"], ""]
        lines.extend("- Nodes " + ", ".join(match["node_ids"]) + "; relations " + ", ".join(match["relation_ids"]) + "." for match in motif["matches"])
        lines.append("")
    lines += ["## Lexical retrieval", "", result["lexical_returns"]["method"], "", result["lexical_returns"]["limitations"], "", "| Earlier article block | Later article block | Cosine | Shared terms |", "| --- | --- | ---: | --- |"]
    lines.extend("| " + pair["earlier_id"] + " | " + pair["later_id"] + " | " + str(pair["score"]) + " | " + ", ".join(pair["shared_terms"]) + " |" for pair in result["lexical_returns"]["pairs"])
    if result.get('contextual'):
        contextual = result['contextual']
        lines += ["", "## Concepts in context", "", contextual['method'], "", contextual['limitation'], "",
                  str(contextual['coverage']['records']) + " contextual readings across " + str(contextual['coverage']['classified_blocks']) + " of " + str(contextual['coverage']['body_blocks']) + " body blocks.", ""]
        lines += ["| Concept | Selected passages |", "| --- | ---: |"]
        for concept in contextual['codebook']:
            count = sum(cell['count'] for cell in contextual['cells'] if cell['concept_id'] == concept['id'])
            lines.append('| ' + concept['label'] + ' | ' + str(count) + ' |')
    lines += ["", "## Input SHA-256", ""]
    lines.extend("- `" + name + "`: `" + digest + "`" for name, digest in result["input_sha256"].items())
    return "\n".join(lines) + "\n"


def export(root=ROOT, output=None):
    root = Path(root)
    output = Path(output) if output is not None else root / "site/data"
    paths = {"analysis": root / "site/data/analysis.json", "codebook": root / "data/collaboration-codebook.json", "episodes": root / "data/collaboration-episodes.json", "contextual": root / "data/contextual-codebook.json"}
    raw = {name: path.read_bytes() for name, path in paths.items()}
    data = {name: json.loads(payload) for name, payload in raw.items()}
    result = analyze(data["analysis"], data["codebook"], data["episodes"], {name: sha256(payload) for name, payload in raw.items()})
    result['contextual'] = contextual_analysis(data['analysis']['article']['blocks'], data['contextual'])
    episode_rows = [{"episode_id": episode["id"], "title": episode["title"], "basis": episode["basis"], "sequence_status": episode["sequence_status"],
                     "patterns": ";".join(episode["pattern_ids"]), "conclusion": episode["change"]["conclusion"], "justification": episode["change"]["justification"],
                     "source_ids": ";".join(episode["source_ids"]), "explanation": episode["change"]["explanation"], "review_status": episode["review_status"]} for episode in result["episodes"]]
    family_for_type = {row["type"]: row["family"] for row in result["relation_types"]}
    relation_rows = [{"relation_id": relation["id"], "source": relation["source"], "target": relation["target"], "type": relation["type"],
                      "family": family_for_type[relation["type"]], "source_ids": ";".join(span["block_id"] for span in relation["evidence"]["spans"]),
                      "rationale": relation["rationale"], "review_status": relation["review_status"]} for relation in data["analysis"]["relations"]]
    dumps = lambda value: json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    files = {"collaboration-analysis.json": dumps(result), "collaboration-codebook.json": dumps(data["codebook"]),
             "contextual-codebook.json": dumps(data['contextual']),
             "contextual-readings.csv": csv_text(['id', 'block_id', 'concept_id', 'subject', 'mode', 'interpretation', 'review_status', 'quote', 'start', 'end'],
                                                  [{**item, **item['evidence']} for item in result['contextual']['records']]),
             "collaboration-episodes.csv": csv_text(["episode_id", "title", "basis", "sequence_status", "patterns", "conclusion", "justification", "source_ids", "explanation", "review_status"], episode_rows),
             "collaboration-relations.csv": csv_text(["relation_id", "source", "target", "type", "family", "source_ids", "rationale", "review_status"], relation_rows),
             "collaboration-report.md": render_report(result)}
    # Input and all output representations are validated/computed before writes.
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".collaboration-", dir=output) as temporary:
        stage = Path(temporary)
        for name, content in files.items():
            (stage / name).write_text(content, encoding="utf-8")
        for name in files:
            os.replace(stage / name, output / name)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = export(args.root, args.output)
    print("Analyzed " + str(result["counts"]["episodes"]) + " selected episodes across " + str(result["counts"]["patterns"]) + " provisional patterns.")
    print(str(result["counts"]["annotated_body_blocks"]) + "/" + str(result["counts"]["body_blocks"]) + " body blocks contain analytical anchors.")
    print(str(len(result["graph"]["paths"])) + " reachable directed pairs; " + str(len(result["lexical_returns"]["pairs"])) + " lexical passage pairs exported.")


if __name__ == "__main__":
    main()
