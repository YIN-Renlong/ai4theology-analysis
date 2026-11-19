#!/usr/bin/env python3
"""Publish this demo to an absent or empty repository owned by YIN-Renlong."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
OWNER = "YIN-Renlong"


class PublishError(Exception):
    pass


def run(args, cwd=None, timeout=120, allow_failure=False):
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if result.returncode and not allow_failure:
        detail = (result.stderr or result.stdout).strip()
        raise PublishError(detail or "Command failed: " + args[0])
    return result


def api(gh, endpoint, method=None, fields=(), allow_missing=False):
    command = [gh, "api", endpoint]
    if method:
        command += ["--method", method]
    for key, value in fields:
        command += ["-f", key + "=" + value]
    result = run(command, allow_failure=True)
    if result.returncode:
        if allow_missing and "HTTP 404" in result.stderr:
            return None
        raise PublishError(result.stderr.strip() or "GitHub request failed.")
    return json.loads(result.stdout) if result.stdout.strip() else {}


def repository_is_empty(gh, repository):
    result = run([gh, "api", f"repos/{repository}/commits?per_page=1"], allow_failure=True)
    if result.returncode:
        message = (result.stdout + result.stderr).lower()
        if "http 409" in message and "empty" in message:
            return True
        raise PublishError(result.stderr.strip() or "Could not establish whether the repository is empty.")
    commits = json.loads(result.stdout)
    return isinstance(commits, list) and not commits


def package_files():
    required = ["README.md", ".gitignore", "Start Demo.command", ".github/workflows/pages.yml",
                "data/analysis-to-share.zip", "data/edition-chapters.json"]
    files = [ROOT / name for name in required]
    for directory in ("site", "scripts", "tests"):
        for path in sorted((ROOT / directory).rglob("*")):
            if path.is_symlink():
                raise PublishError("A package path is a symbolic link: " + str(path.relative_to(ROOT)))
            if not path.is_file() or "__pycache__" in path.parts:
                continue
            if directory in ("scripts", "tests") and path.suffix != ".py":
                continue
            if path.name.startswith(".env") or path.suffix in {".key", ".pem"}:
                raise PublishError("A private-looking file is present in the publication package.")
            files.append(path)
    for path in files:
        if path.is_symlink() or not path.is_file():
            raise PublishError("Required publication file is missing or linked: " + str(path.relative_to(ROOT)))
    if not (ROOT / "site/index.html").is_file():
        raise PublishError("The demo site is missing.")
    return list(dict.fromkeys(files))


def validate_repository_name(value):
    if "/" not in value:
        value = OWNER + "/" + value
    owner, separator, name = value.partition("/")
    if owner != OWNER or not separator or name in {".", ".."} or not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", name):
        raise PublishError("Choose a repository under YIN-Renlong, for example YIN-Renlong/ai4theology-analysis.")
    return value


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=OWNER + "/ai4theology-analysis",
                        help="Repository explicitly chosen by the user; defaults to YIN-Renlong/ai4theology-analysis")
    args = parser.parse_args(argv)
    repository = validate_repository_name(args.repo)
    gh, git = shutil.which("gh"), shutil.which("git")
    if not gh or not git:
        raise PublishError("Install the GitHub CLI and Git first, then run gh auth login. No repository was changed.")
    identity = api(gh, "user")
    if identity.get("login") != OWNER:
        raise PublishError("GitHub CLI is signed in as " + str(identity.get("login", "an unknown account"))
                           + ". Sign in as YIN-Renlong with gh auth login and rerun. No repository was changed.")
    existing = api(gh, "repos/" + repository, allow_missing=True)
    if existing is not None and not repository_is_empty(gh, repository):
        raise PublishError("The repository " + repository + " already contains commits. Nothing was uploaded or overwritten. Inspect its existing files and Pages setup before integrating this demo.")

    # Prepare and verify all material before the first remote mutation.
    print("Checking the demo locally…", flush=True)
    run([sys.executable, "scripts/build_data.py"], cwd=ROOT)
    run([sys.executable, "scripts/analyze_collaboration.py"], cwd=ROOT)
    run([sys.executable, "scripts/build_edition.py"], cwd=ROOT)
    run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"], cwd=ROOT)
    files = package_files()
    if existing is None:
        print("Creating public repository " + repository + "…", flush=True)
        run([gh, "repo", "create", repository, "--public", "--description",
             "An evidence-linked visual inquiry into human–AI collaboration and theological pedagogy."])
        existing = api(gh, "repos/" + repository)

    branch = existing.get("default_branch") or "main"
    with tempfile.TemporaryDirectory(prefix="ai4theology-publish-") as temporary:
        checkout = Path(temporary) / "repository"
        run([gh, "repo", "clone", repository, str(checkout), "--", "--quiet"])
        remote_refs = run([git, "ls-remote", "origin"], cwd=checkout).stdout.strip()
        if remote_refs:
            raise PublishError("The repository acquired commits during preparation. Nothing was overwritten; inspect it before continuing.")
        run([git, "checkout", "-B", branch], cwd=checkout)
        for path in files:
            destination = checkout / path.relative_to(ROOT)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, destination)
        # Identity applies to this temporary checkout only; global Git settings stay intact.
        run([git, "config", "user.name", identity.get("name") or OWNER], cwd=checkout)
        run([git, "config", "user.email", f"{identity['id']}+{OWNER}@users.noreply.github.com"], cwd=checkout)
        run([git, "config", "credential.helper", "!gh auth git-credential"], cwd=checkout)
        run([git, "add", "--", "."], cwd=checkout)
        run([git, "commit", "-m", "Add evidence-linked theological inquiry demo"], cwd=checkout)
        print("Uploading the checked demo…", flush=True)
        run([git, "push", "origin", "HEAD:refs/heads/" + branch], cwd=checkout)

    pages = api(gh, "repos/" + repository + "/pages", allow_missing=True)
    method = "POST" if pages is None else "PUT"
    api(gh, "repos/" + repository + "/pages", method=method,
        fields=(("build_type", "workflow"),))
    # Start explicitly after Pages is enabled. A push-triggered run may have started sooner.
    for attempt in range(4):
        dispatch = run([gh, "workflow", "run", "pages.yml", "--repo", repository,
                        "--ref", branch], allow_failure=True)
        if dispatch.returncode == 0:
            break
        if attempt == 3:
            raise PublishError("The code was uploaded and Pages enabled, but the workflow could not be started automatically. Open https://github.com/" + repository + "/actions and run Publish AI4Theology demo.")
        time.sleep(2)
    pages = api(gh, "repos/" + repository + "/pages")
    print("Repository: https://github.com/" + repository)
    print("Deployment started: https://github.com/" + repository + "/actions")
    if pages.get("html_url"):
        print("Pages address (available after deployment succeeds): " + pages["html_url"])
    print("Your original local project files were preserved. The temporary checkout has been removed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (PublishError, OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print("Publication stopped: " + str(exc), file=sys.stderr)
        raise SystemExit(1)
