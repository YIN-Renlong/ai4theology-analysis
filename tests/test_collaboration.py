"""Behavioural checks for source integrity, aggregation, graph queries and NLP."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import analyze_collaboration as analysis


class CollaborationTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / "site/data/analysis.json").read_text())
        self.codebook = json.loads((ROOT / "data/collaboration-codebook.json").read_text())
        self.episodes = json.loads((ROOT / "data/collaboration-episodes.json").read_text())

    def run_analysis(self):
        return analysis.analyze(self.data, self.codebook, self.episodes)

    def test_counts_have_distinct_denominators_and_coverage(self):
        result = self.run_analysis()
        self.assertEqual(result["counts"]["nodes"], 25)
        self.assertEqual(result["counts"]["relations"], 21)
        self.assertEqual(result["counts"]["body_blocks"], 118)
        self.assertEqual(result["counts"]["annotated_body_blocks"], 21)
        self.assertEqual(sum(row["count"] for row in result["relation_families"]), 21)
        self.assertEqual(sum(row["count"] for row in result["relation_types"]), 21)
        self.assertEqual(sum(row["count"] for row in result["evidence_basis"]), 25)
        self.assertEqual(sum(row["count"] for row in result["changes"]), len(self.episodes["episodes"]))
        for pattern in result["patterns"]:
            self.assertEqual(pattern["count"], len(pattern["episode_ids"]))
        for episode in result["episodes"]:
            self.assertTrue(episode["source_ids"])
            self.assertEqual(episode["review_status"], "proposed_by_assistant")
        self.assertTrue(all(not block.get("is_reference") for block in self.data["article"]["blocks"] if block["id"] in {row["block_id"] for row in result["coverage"]}))

    def test_analysis_preserves_inputs_and_does_not_invent_learning(self):
        before = deepcopy((self.data, self.codebook, self.episodes))
        result = self.run_analysis()
        self.assertEqual(before, (self.data, self.codebook, self.episodes))
        # Supplied coding does not demonstrate a measured pre/post learning effect.
        self.assertTrue(all(episode["change"]["conclusion"] in {"unresolved", "not_established"} for episode in result["episodes"]))
        self.assertNotIn("learning_score", result)
        self.assertNotIn("transition_probability", result)
        self.assertEqual(result["method"]["review_status"], "proposed_by_assistant")

    def test_source_offset_mismatch_rejected(self):
        self.data["nodes"][0]["evidence"]["spans"][0]["start"] += 1
        with self.assertRaisesRegex(ValueError, "Invalid source span"):
            self.run_analysis()

    def test_empty_evidence_and_unresolved_anchors_rejected(self):
        self.data["nodes"][0]["evidence"]["spans"] = []
        with self.assertRaisesRegex(ValueError, "Missing matched evidence"):
            self.run_analysis()
        self.data["unresolved_anchors"] = [{"id": "unknown"}]
        with self.assertRaisesRegex(ValueError, "unresolved anchors"):
            self.run_analysis()

    def test_unknown_episode_references_and_states_rejected(self):
        self.episodes["episodes"][0]["node_ids"].append("not-a-node")
        with self.assertRaisesRegex(ValueError, "Unknown or duplicate reference"):
            self.run_analysis()
        self.episodes["episodes"][0]["node_ids"].pop()
        self.episodes["episodes"][0]["change"]["conclusion"] = "learned_successfully"
        with self.assertRaisesRegex(ValueError, "Unknown change state"):
            self.run_analysis()

    def test_duplicate_ids_and_uncovered_relation_type_rejected(self):
        self.data["nodes"].append(deepcopy(self.data["nodes"][0]))
        with self.assertRaisesRegex(ValueError, "duplicate node"):
            self.run_analysis()
        self.data["nodes"].pop()
        self.codebook["relation_families"]["argument"].pop()
        with self.assertRaisesRegex(ValueError, "partition every relationship type"):
            self.run_analysis()

    def test_hypothetical_episode_cannot_become_observed_sequence(self):
        hypothetical = next(item for item in self.episodes["episodes"] if item["basis"] == "hypothetical_example")
        hypothetical["sequence_status"] = "reported_order"
        with self.assertRaisesRegex(ValueError, "Hypothetical episode"):
            self.run_analysis()

    def test_graph_follows_edge_direction_and_handles_cycles(self):
        nodes = [{"id": value} for value in "abcd"]
        relations = [
            {"id": "r1", "source": "a", "target": "b"},
            {"id": "r2", "source": "b", "target": "c"},
            {"id": "r3", "source": "c", "target": "a"},
            {"id": "r4", "source": "a", "target": "c"},
        ]
        paths = analysis.graph_paths(nodes, relations)
        indexed = {(path["source"], path["target"]): path for path in paths}
        self.assertEqual(indexed[("a", "c")]["relation_ids"], ["r4"])
        self.assertEqual(indexed[("b", "a")]["node_ids"], ["b", "c", "a"])
        self.assertNotIn(("a", "a"), indexed)
        self.assertFalse(any("d" in pair for pair in indexed))
        self.assertEqual(len(indexed), 6)

    def test_recurrence_motif_requires_return_and_reported_order(self):
        motifs = {item["id"]: item for item in analysis.graph_motifs(self.data["nodes"], self.data["relations"])}
        self.assertEqual(motifs["repair_recurrence"]["count"], 1)
        self.assertEqual(set(motifs["repair_recurrence"]["matches"][0]["relation_ids"]), {"R03", "R04", "R20", "R21"})
        self.assertEqual(motifs["scholarly_qualification"]["count"], 2)
        self.assertEqual(motifs["alternative_to_misapplication"]["count"], 1)
        for removed in ("R20", "R21"):
            filtered = [r for r in self.data["relations"] if r["id"] != removed]
            motif = next(item for item in analysis.graph_motifs(self.data["nodes"], filtered) if item["id"] == "repair_recurrence")
            self.assertEqual(motif["count"], 0)
        reversed_relations = deepcopy(self.data["relations"])
        relation = next(r for r in reversed_relations if r["id"] == "R21")
        relation["source"], relation["target"] = relation["target"], relation["source"]
        motif = next(item for item in analysis.graph_motifs(self.data["nodes"], reversed_relations) if item["id"] == "repair_recurrence")
        self.assertEqual(motif["count"], 0)

    def test_lexical_retrieval_excludes_references_and_adjacent_pairs(self):
        def block(identifier, text, kind="paragraph", reference=False):
            return {"id": identifier, "text": text, "kind": kind, "is_reference": reference}
        blocks = [block("p1", "Theological inference theological reasoning"),
                  block("p2", "Theological inference theological reasoning"),
                  block("p3", "Architecture software diagrams"),
                  block("p4", "THEOLOGICAL INFERENCE theological reasoning"),
                  block("ref", "Theological inference theological reasoning", reference=True),
                  block("heading", "Theological inference theological reasoning", kind="heading")]
        options = {**analysis.LEXICAL_OPTIONS, "min_paragraph_words": 1}
        result = analysis.lexical_returns(blocks, options)
        self.assertEqual(result["eligible_paragraphs"], 4)
        self.assertEqual(result["pairs"], [{"earlier_id": "p1", "later_id": "p4", "score": 1.0,
                                           "shared_terms": ["theological", "inference", "reasoning"]}])
        self.assertFalse(result["options"]["stemming"])
        self.assertEqual(result["options"]["min_body_index_distance"], 3)
        matrix = result['matrix']
        self.assertEqual(matrix['block_ids'], ['p1', 'p2', 'p3', 'p4'])
        # Adjacent matches are retained in the full matrix, while excluded above.
        self.assertEqual(matrix['values'][0][1], 1.0)
        self.assertEqual(matrix['values'][0][2], 0.0)
        for i, row in enumerate(matrix['values']):
            self.assertEqual(row[i], 1.0)
            for j, value in enumerate(row):
                self.assertGreaterEqual(value, 0.0)
                self.assertLessEqual(value, 1.0)
                self.assertEqual(value, matrix['values'][j][i])

    def test_csv_neutralizes_spreadsheet_formula_cells(self):
        for value in ("=SUM(1,2)", " +cmd", "-2+3", "@formula", "\tcommand", "\rvalue", "\nvalue"):
            self.assertTrue(analysis.safe_csv_value(value).startswith("'"))
        self.assertEqual(analysis.safe_csv_value("ordinary prose"), "ordinary prose")

    def test_export_reproducibility_hashes_and_invalid_input_preserves_outputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "data").mkdir()
            (root / "site/data").mkdir(parents=True)
            contextual = json.loads((ROOT / 'data/contextual-codebook.json').read_text())
            pairs = [("site/data/analysis.json", self.data), ("data/collaboration-codebook.json", self.codebook), ("data/collaboration-episodes.json", self.episodes), ('data/contextual-codebook.json', contextual)]
            for name, data in pairs:
                (root / name).write_text(json.dumps(data))
            result = analysis.export(root)
            outputs = {p.name: p.read_bytes() for p in (root / "site/data").glob("collaboration-*")}
            analysis.export(root)
            self.assertEqual(outputs, {p.name: p.read_bytes() for p in (root / "site/data").glob("collaboration-*")})
            self.assertEqual(result["input_sha256"]["analysis"], hashlib.sha256((root / "site/data/analysis.json").read_bytes()).hexdigest())
            self.episodes["episodes"][0]["node_ids"].append("missing")
            (root / "data/collaboration-episodes.json").write_text(json.dumps(self.episodes))
            with self.assertRaises(ValueError):
                analysis.export(root)
            self.assertEqual(outputs, {p.name: p.read_bytes() for p in (root / "site/data").glob("collaboration-*")})


if __name__ == "__main__":
    unittest.main()
