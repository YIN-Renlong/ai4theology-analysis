import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("publish_github", ROOT / "scripts/publish_github.py")
PUBLISH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PUBLISH)


class PublisherSafetyTests(unittest.TestCase):
    def test_wrong_account_stops_before_repo_access_or_write(self):
        with patch.object(PUBLISH.shutil, "which", return_value="tool"), \
             patch.object(PUBLISH, "api", return_value={"login": "different-account"}) as api, \
             patch.object(PUBLISH, "run") as run:
            with self.assertRaisesRegex(PUBLISH.PublishError, "Sign in as YIN-Renlong"):
                PUBLISH.main([])
            self.assertEqual(api.call_count, 1)
            run.assert_not_called()

    def test_populated_repo_stops_before_build_or_write(self):
        with patch.object(PUBLISH.shutil, "which", return_value="tool"), \
             patch.object(PUBLISH, "api", side_effect=[{"login": "YIN-Renlong"}, {"default_branch": "main"}]), \
             patch.object(PUBLISH, "repository_is_empty", return_value=False), \
             patch.object(PUBLISH, "run") as run:
            with self.assertRaisesRegex(PUBLISH.PublishError, "already contains commits"):
                PUBLISH.main([])
            run.assert_not_called()

    def test_repository_is_owner_scoped(self):
        self.assertEqual(PUBLISH.validate_repository_name("ai4theology"), "YIN-Renlong/ai4theology")
        self.assertEqual(PUBLISH.validate_repository_name("YIN-Renlong/my-demo"), "YIN-Renlong/my-demo")
        for invalid in ["another-owner/repo", "../repo", "YIN-Renlong/..", "x/y/z"]:
            with self.assertRaises(PUBLISH.PublishError):
                PUBLISH.validate_repository_name(invalid)

    def test_only_empty_repository_conflict_is_accepted(self):
        empty = SimpleNamespace(returncode=1, stdout='{"message":"Git Repository is empty."}', stderr="gh: Git Repository is empty. (HTTP 409)")
        forbidden = SimpleNamespace(returncode=1, stdout="", stderr="gh: Resource not accessible (HTTP 403)")
        with patch.object(PUBLISH, "run", return_value=empty):
            self.assertTrue(PUBLISH.repository_is_empty("gh", "YIN-Renlong/ai4theology"))
        with patch.object(PUBLISH, "run", return_value=forbidden):
            with self.assertRaises(PUBLISH.PublishError):
                PUBLISH.repository_is_empty("gh", "YIN-Renlong/ai4theology")

    def test_api_does_not_treat_permission_failure_as_absence(self):
        forbidden = SimpleNamespace(returncode=1, stdout="", stderr="gh: Forbidden (HTTP 403)")
        missing = SimpleNamespace(returncode=1, stdout="", stderr="gh: Not Found (HTTP 404)")
        with patch.object(PUBLISH, "run", return_value=forbidden):
            with self.assertRaises(PUBLISH.PublishError):
                PUBLISH.api("gh", "repos/YIN-Renlong/ai4theology", allow_missing=True)
        with patch.object(PUBLISH, "run", return_value=missing):
            self.assertIsNone(PUBLISH.api("gh", "repos/YIN-Renlong/ai4theology", allow_missing=True))


if __name__ == "__main__":
    unittest.main()
