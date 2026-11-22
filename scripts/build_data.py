#!/usr/bin/env python3
"""Export a public, evidence-linked visualisation dataset from the returned analysis."""
import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.2.0"


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def evidence(anchor, blocks):
    matches = []
    for block in blocks:
        if block.get("is_reference"):
            continue
        start = 0
        while True:
            start = block["text"].find(anchor, start)
            if start < 0:
                break
            matches.append({"block_id": block["id"], "start": start,
                            "end": start + len(anchor), "quote": anchor})
            start += max(len(anchor), 1)
    if len(matches) != 1:
        raise ValueError("Expected exactly one source span for: " + anchor)
    return {"status": "matched", "spans": matches}


def verify_spans(items, blocks):
    indexed = {block["id"]: block for block in blocks}
    for item in items:
        if item["evidence"]["status"] != "matched":
            raise ValueError("Unmatched annotation: " + item["id"])
        for span in item["evidence"]["spans"]:
            block = indexed[span["block_id"]]
            if block["text"][span["start"]:span["end"]] != span["quote"]:
                raise ValueError("Invalid source offsets: " + item["id"])
        if item.get("anchor") != item["evidence"]["spans"][0]["quote"]:
            raise ValueError("Anchor does not match evidence: " + item["id"])


def public_copy(value):
    """Reject accidental local-file disclosure; do not silently rewrite quotations."""
    serialised = json.dumps(value, ensure_ascii=False)
    for prefix in ("/Users/", "/workspace/", "file://", "/root/"):
        if prefix in serialised:
            raise ValueError("Private filesystem path found in the public export.")
    return deepcopy(value)


def load_input(path):
    with ZipFile(path) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        raw = archive.read("send-to-chatgpt.json")
        report = archive.read("analysis-report.md")
    for name, payload in (("send-to-chatgpt.json", raw), ("analysis-report.md", report)):
        if sha256(payload) != manifest["files_sha256"][name]:
            raise ValueError("Input manifest hash mismatch: " + name)
    data = json.loads(raw)
    if data["article"]["source"]["sha256"] != manifest["source_sha256"]:
        raise ValueError("Source identifiers do not agree.")
    verify_spans(data["nodes"] + data["relations"], data["article"]["blocks"])
    if data.get("unresolved_anchors"):
        raise ValueError("The input still contains unresolved anchors.")
    return public_copy(data), {
        "input_sha256": sha256(raw),
        "report_sha256": sha256(report),
        "source_sha256": manifest["source_sha256"],
        "source_hash_status": "identifier copied from input; raw HTML is not included in this archive",
        "manifest_checks": {"send-to-chatgpt.json": True, "analysis-report.md": True},
        "input_created_utc": manifest["created_utc"],
        "input_software_version": manifest["software_version"],
        "input_case_sha256": manifest["case_sha256"],
        "annotation_offset_checks": True,
    }


def build_dataset(original, audit):
    output = deepcopy(original)
    blocks = output["article"]["blocks"]
    revisions = []
    for relation in output["relations"]:
        old = relation["type"]
        if relation["id"] == "R03":
            relation["type"] = "questions_relevance_of"
            relation["rationale"] = "The author accepts the caution as sound while questioning its relevance to the intended comparison. This does not reject the caution's truth."
        elif relation["id"] == "R04":
            relation["type"] = "acknowledges"
            relation["rationale"] = "The article reports the assistant acknowledging the mismatch. Acknowledgment is not independent evidence that the criticism is correct."
        if old != relation["type"]:
            revisions.append({"id": relation["id"], "change": "relationship_label",
                              "before": old, "after": relation["type"],
                              "reason": relation["rationale"]})

    additions = [
        {"id": "A22", "label": "A restriction within scientific method",
         "anchor": "a scientific method restricts certain kinds of explanation",
         "interpretation": "This clause concerns what a scientific method admits as an explanation. In the article's hypothetical example, it is distinct from a conclusion about everything that exists.",
         "category": "theological_inference", "record_basis": "hypothetical_example", "actor_as_reported": "author"},
        {"id": "A23", "label": "The unsupported metaphysical step",
         "anchor": "then mistakenly treat that methodological restriction as a proof about everything that exists.",
         "interpretation": "The article proposes an error of inference: treating a restriction of method as proof of an exhaustive metaphysical claim. This is an illustrative contrast, not an observed student error.",
         "category": "theological_inference", "record_basis": "hypothetical_example", "actor_as_reported": "author"},
        {"id": "A24", "label": "Challenge the inference, retain the finding",
         "anchor": "a learner could challenge an argument's metaphysical step without rejecting the scientific finding on which it draws.",
         "interpretation": "The alternative response distinguishes evaluating the metaphysical inference from rejecting the scientific finding. It is a proposed way to examine understanding.",
         "category": "theological_inference", "record_basis": "hypothetical_example", "actor_as_reported": "author"},
        {"id": "A25", "label": "The objection has to return",
         "anchor": "Yet the qualification about human feedback and AI-generated arguments resurfaced, and I again objected that AI could supply the same kind of feedback.",
         "interpretation": "The published account reports a recurrence after the assistant's acknowledgment. This annotation preserves an iteration compressed by the earlier coding. Selected original exchanges are aligned separately in the reader; this annotation remains grounded in the article.",
         "category": "iteration", "record_basis": "retrospective_account", "actor_as_reported": "author"},
    ]
    for node in additions:
        node["review_status"] = "proposed_by_assistant"
        node["evidence"] = evidence(node["anchor"], blocks)
        output["nodes"].append(node)
        revisions.append({"id": node["id"], "change": "source_anchored_node_added",
                          "reason": node["interpretation"]})

    added_relations = [
        ("R17", "A22", "A16", "specifies", additions[0]["anchor"],
         "The methodological clause specifies one element of the article's theological example."),
        ("R18", "A23", "A16", "illustrates_misapplication", additions[1]["anchor"],
         "The exhaustive metaphysical conclusion illustrates the proposed misapplication of an accurately recited distinction."),
        ("R19", "A24", "A23", "offers_alternative_to", additions[2]["anchor"],
         "The hypothetical learner could assess the metaphysical step while retaining the scientific finding."),
        ("R20", "A25", "A05", "returns_to", additions[3]["anchor"],
         "The author reports returning to the objection that AI can provide the same kind of feedback."),
        ("R21", "A25", "A06", "follows_acknowledgment_in_account", additions[3]["anchor"],
         "Within the article's retrospective account, the objection resurfaces after the acknowledgment. This edge records the article's reported order; the selected original exchanges and their alignments are provided separately."),
    ]
    for identifier, source, target, kind, anchor, rationale in added_relations:
        relation = {"id": identifier, "source": source, "target": target, "type": kind,
                    "anchor": anchor, "rationale": rationale,
                    "review_status": "proposed_by_assistant", "eligible_for_graph": True,
                    "evidence": evidence(anchor, blocks)}
        output["relations"].append(relation)
        revisions.append({"id": identifier, "change": "source_anchored_relation_added", "reason": rationale})

    verify_spans(output["nodes"] + output["relations"], blocks)
    ids = {node["id"] for node in output["nodes"]}
    if len(ids) != len(output["nodes"]):
        raise ValueError("Duplicate node identifier.")
    for relation in output["relations"]:
        if relation["source"] not in ids or relation["target"] not in ids:
            raise ValueError("Unknown relationship endpoint.")

    counts = {
        "record_basis": dict(sorted(Counter(n["record_basis"] for n in output["nodes"]).items())),
        "relation_types": dict(sorted(Counter(r["type"] for r in output["relations"]).items())),
        "actors_as_reported": dict(sorted(Counter(n["actor_as_reported"] for n in output["nodes"]).items())),
        "categories": dict(sorted(Counter(n["category"] for n in output["nodes"]).items())),
    }
    summary = output["summary"]
    summary["original_proposed_nodes"] = len(original["nodes"])
    summary["original_proposed_relations"] = len(original["relations"])
    summary["proposed_nodes"] = len(output["nodes"])
    summary["proposed_relations"] = len(output["relations"])
    summary["nodes_with_unique_anchors"] = len(output["nodes"])
    summary["relations_eligible_for_graph"] = len(output["relations"])
    summary["record_basis_counts"] = counts["record_basis"]
    summary["annotation_review_statuses"] = {"proposed_by_assistant": len(output["nodes"]) + len(output["relations"])}
    output["original_summary"] = deepcopy(original["summary"])
    output["counts"] = counts
    output["export_version"] = VERSION
    output["source_audit"] = deepcopy(audit)
    output["revision_log"] = revisions
    output["method_note"] = "Descriptive counts refer to the selected coding, not the entire conversation or a learning score. Relationships remain assistant-proposed interpretations linked to article passages."
    output["reading_order_note"] = "The visual reading sequence is an editorial reconstruction. Argumentative arrows are not chronological arrows."
    # The input graph query cache describes the original graph only.
    output.pop("graph_queries", None)
    return public_copy(output)


def export(input_path, output_path):
    original, audit = load_input(input_path)
    dataset = build_dataset(original, audit)
    output_path.mkdir(parents=True, exist_ok=True)
    record = {"schema_version": 1, "export_version": VERSION,
              "original_analysis": original, "source_audit": audit,
              "revision_log": dataset["revision_log"],
              "published_dataset": "analysis.json"}
    for name, value in (("analysis.json", dataset), ("research-record.json", record)):
        (output_path / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return dataset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "data/analysis-to-share.zip")
    parser.add_argument("--output", type=Path, default=ROOT / "site/data")
    args = parser.parse_args()
    dataset = export(args.input, args.output)
    print(f"Exported {len(dataset['nodes'])} proposed nodes and {len(dataset['relations'])} proposed relationships.")
    print("Original coding retained separately: 21 nodes, 16 relationships.")


if __name__ == "__main__":
    main()
