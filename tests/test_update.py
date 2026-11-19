"""Guard update destination and preserve the remote checkout during overlay."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("update_github", ROOT / "scripts/update_github.py")
UPDATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(UPDATE)


class UpdateTests(unittest.TestCase):
    def test_wrong_account_stops_before_repository_or_command(self):
        with patch.object(UPDATE.shutil, "which", return_value="tool"), \
             patch.object(UPDATE, "api", return_value={"login": "different-account"}) as api, \
             patch.object(UPDATE, "run") as run:
            with self.assertRaisesRegex(UPDATE.UpdateError, "signed in as YIN-Renlong"):
                UPDATE.main([])
            api.assert_called_once_with("tool", "user")
            run.assert_not_called()

    def test_repository_and_origin_guards(self):
        valid = {"full_name": UPDATE.REPOSITORY, "default_branch": "main", "permissions": {"push": True}}
        UPDATE.validate_repository(valid)
        UPDATE.validate_origin(UPDATE.ORIGIN)
        invalid = [dict(valid, full_name="YIN-Renlong/another-project"),
                   dict(valid, full_name="someone-else/ai4theology-analysis"),
                   dict(valid, default_branch="different-branch"),
                   dict(valid, permissions={"push": False})]
        for repository in invalid:
            with self.subTest(repository=repository):
                with self.assertRaises(UPDATE.UpdateError):
                    UPDATE.validate_repository(repository)
        for origin in ["https://github.com/other/ai4theology-analysis.git", UPDATE.ORIGIN + ".attacker.example", "file:///tmp/repo"]:
            with self.subTest(origin=origin):
                with self.assertRaises(UPDATE.UpdateError):
                    UPDATE.validate_origin(origin)

    def test_overlay_updates_selected_files_and_preserves_others(self):
        with tempfile.TemporaryDirectory() as temp:
            root, checkout = Path(temp) / "source", Path(temp) / "checkout"
            (root / "site").mkdir(parents=True)
            (checkout / "site").mkdir(parents=True)
            (root / "site/index.html").write_text("new edition")
            (checkout / "site/index.html").write_text("old edition")
            (checkout / "site/unrelated.html").write_text("other research")
            (checkout / "notes.md").write_text("keep these notes")
            with patch.object(UPDATE, "ROOT", root):
                UPDATE.overlay([root / "site/index.html"], checkout)
            self.assertEqual((checkout / "site/index.html").read_text(), "new edition")
            self.assertEqual((checkout / "site/unrelated.html").read_text(), "other research")
            self.assertEqual((checkout / "notes.md").read_text(), "keep these notes")

    def test_overlay_rejects_a_linked_destination(self):
        with tempfile.TemporaryDirectory() as temp:
            root, checkout, outside = (Path(temp) / name for name in ("source", "checkout", "outside"))
            (root / "site").mkdir(parents=True)
            checkout.mkdir()
            outside.mkdir()
            source = root / "site/index.html"
            source.write_text("new edition")
            (checkout / "site").symlink_to(outside, target_is_directory=True)
            with patch.object(UPDATE, "ROOT", root):
                with self.assertRaisesRegex(UPDATE.UpdateError, "symbolic link"):
                    UPDATE.overlay([source], checkout)
            self.assertFalse((outside / "index.html").exists())

    def test_package_excludes_qa_and_os_metadata(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in ("README.md", ".gitignore", "Start Demo.command", "Update GitHub.command", "site/index.html", "site/.nojekyll", "scripts/update_github.py", "tests/test_update.py", "data/input.json", ".github/workflows/pages.yml", "site/phone-qa.html", "site/.DS_Store", "site/._index.html", "data/__MACOSX/resource", "site/.Spotlight-V100/metadata", "tests/__pycache__/test.pyc"):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("example")
            with patch.object(UPDATE, "ROOT", root):
                included = {str(path.relative_to(root)) for path in UPDATE.package_files()}
                self.assertIn("site/.nojekyll", included)
                self.assertIn(".github/workflows/pages.yml", included)
                self.assertNotIn("site/phone-qa.html", included)
                self.assertFalse(any(".DS_Store" in p or "._" in p or "__MACOSX" in p or "Spotlight" in p or "__pycache__" in p for p in included))
                (root / "site/linked.html").symlink_to(root / "site/index.html")
                with self.assertRaisesRegex(UPDATE.UpdateError, "Linked package file"):
                    UPDATE.package_files()


if __name__ == "__main__":
    unittest.main()
