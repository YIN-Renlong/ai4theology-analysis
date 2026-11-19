import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("build_data", ROOT / "scripts/build_data.py")
BUILD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)
INPUT = ROOT / "data/analysis-to-share.zip"


class ExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original, cls.audit = BUILD.load_input(INPUT)
        cls.data = BUILD.build_dataset(cls.original, cls.audit)

    def test_input_hashes_and_offsets_verified(self):
        self.assertTrue(all(self.audit["manifest_checks"].values()))
        BUILD.verify_spans(self.data["nodes"] + self.data["relations"], self.data["article"]["blocks"])

    def test_counts_are_separated(self):
        summary = self.data["summary"]
        self.assertEqual((summary["original_proposed_nodes"], summary["original_proposed_relations"]), (21, 16))
        self.assertEqual((summary["proposed_nodes"], summary["proposed_relations"]), (25, 21))
        self.assertEqual((summary["content_blocks"], summary["reference_blocks"], summary["links_in_content"]), (118, 29, 53))
        self.assertEqual(sum(self.data["counts"]["record_basis"].values()), 25)
        self.assertEqual(sum(self.data["counts"]["relation_types"].values()), 21)

    def test_relation_semantics_and_evidence_status(self):
        rels = {r["id"]: r for r in self.data["relations"]}
        self.assertEqual(rels["R03"]["type"], "questions_relevance_of")
        self.assertEqual(rels["R04"]["type"], "acknowledges")
        nodes = {n["id"]: n for n in self.data["nodes"]}
        for identifier in ["A22", "A23", "A24"]:
            self.assertEqual(nodes[identifier]["record_basis"], "hypothetical_example")
            self.assertEqual(nodes[identifier]["evidence"]["spans"][0]["block_id"], "P108")
        self.assertEqual(nodes["A25"]["record_basis"], "retrospective_account")
        self.assertTrue(all(item["review_status"] == "proposed_by_assistant" for item in self.data["nodes"] + self.data["relations"]))

    def test_export_retains_original(self):
        with tempfile.TemporaryDirectory() as temp:
            BUILD.export(INPUT, Path(temp))
            record = json.loads((Path(temp) / "research-record.json").read_text())
            self.assertEqual(record["original_analysis"], self.original)
            self.assertNotIn("/workspace/", (Path(temp) / "analysis.json").read_text())

    def test_missing_or_ambiguous_anchor_fails(self):
        with self.assertRaises(ValueError):
            BUILD.evidence("not in article", self.data["article"]["blocks"])
        with self.assertRaises(ValueError):
            BUILD.evidence("same", [{"id": "P1", "text": "same same"}])

    def test_corrupt_manifest_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "bad.zip"
            with ZipFile(INPUT) as source, ZipFile(target, "w") as dest:
                for name in source.namelist():
                    value = source.read(name)
                    if name == "send-to-chatgpt.json":
                        value += b" "
                    dest.writestr(name, value)
            with self.assertRaises(ValueError):
                BUILD.load_input(target)


if __name__ == "__main__":
    unittest.main()
