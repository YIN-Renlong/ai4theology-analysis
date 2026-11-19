#!/usr/bin/env python3
"""Update YIN-Renlong/ai4theology-analysis and verify its GitHub Pages workflow."""
import argparse
import json
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
OWNER = "YIN-Renlong"
REPOSITORY = OWNER + "/ai4theology-analysis"
ORIGIN = "https://github.com/" + REPOSITORY + ".git"
BRANCH = "main"
WORKFLOW = "pages.yml"


class UpdateError(Exception):
    pass


def run(args, cwd=None, timeout=120):
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise UpdateError((result.stderr or result.stdout).strip() or "Command failed: " + args[0])
    return result.stdout.strip()


def api(gh, endpoint):
    return json.loads(run([gh, "api", endpoint]))


def validate_identity(profile):
    if profile.get("login") != OWNER:
        raise UpdateError("GitHub CLI must be signed in as YIN-Renlong. Run gh auth switch --user YIN-Renlong, or gh auth login, then run this updater again.")


def validate_repository(repository):
    if repository.get("full_name", "").casefold() != REPOSITORY.casefold():
        raise UpdateError("GitHub returned an unexpected repository.")
    if repository.get("default_branch") != BRANCH:
        raise UpdateError("The repository's default branch has changed. This updater targets main; inspect the repository before continuing.")
    if not repository.get("permissions", {}).get("push"):
        raise UpdateError("The current GitHub CLI connection cannot push to " + REPOSITORY + ".")


def validate_origin(value):
    if value != ORIGIN:
        raise UpdateError("The checkout origin differs from the authorized repository.")


def package_files():
    required = ["README.md", ".gitignore", "Start Demo.command", "Update GitHub.command"]
    files = [ROOT / name for name in required]
    for name in ("scripts", "tests", "data", "site", ".github/workflows"):
        folder = ROOT / name
        if folder.is_symlink() or not folder.is_dir():
            raise UpdateError("Missing or linked package folder: " + name)
        for path in sorted(folder.rglob("*")):
            relative = path.relative_to(ROOT)
            metadata = {".DS_Store", "__MACOSX", ".Spotlight-V100", ".Trashes", ".fseventsd", "Thumbs.db", "desktop.ini", "__pycache__"}
            if path.name == "phone-qa.html" or any(part in metadata or part.startswith("._") for part in relative.parts):
                continue
            if path.is_symlink():
                raise UpdateError("Linked package file: " + str(path.relative_to(ROOT)))
            if not path.is_file() or "__pycache__" in path.parts:
                continue
            if path.name.startswith(".env") or path.suffix in {".key", ".pem", ".pyc"}:
                raise UpdateError("Unexpected private or generated file: " + str(path.relative_to(ROOT)))
            if name in ("scripts", "tests") and path.suffix != ".py":
                continue
            files.append(path)
    for path in files:
        if path.is_symlink() or not path.is_file():
            raise UpdateError("Missing or linked package file: " + str(path.relative_to(ROOT)))
    return files


def overlay(files, checkout):
    for source in files:
        target = checkout / source.relative_to(ROOT)
        for parent in (target, *target.parents):
            if parent == checkout:
                break
            if parent.is_symlink():
                raise UpdateError("A repository path is a symbolic link: " + str(target.relative_to(checkout)))
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def wait_for_pages(gh, commit, timeout=900, after_run_id=0):
    deadline = time.monotonic() + timeout
    previous = None
    endpoint = f"repos/{REPOSITORY}/actions/workflows/{WORKFLOW}/runs?head_sha={commit}&per_page=30"
    while time.monotonic() < deadline:
        runs = api(gh, endpoint).get("workflow_runs", [])
        matching = [r for r in runs if r.get("head_sha") == commit and r.get("head_branch") == BRANCH and r.get("event") != "pull_request" and r["id"] > after_run_id]
        if matching:
            latest = max(matching, key=lambda r: r["id"])
            status = latest.get("status")
            conclusion = latest.get("conclusion")
            state = (latest["id"], status, conclusion)
            if state != previous:
                print("Pages workflow " + str(latest["id"]) + " — " + str(conclusion or status), flush=True)
                previous = state
            if status == "completed":
                if conclusion == "success":
                    return latest
                raise UpdateError("The code was pushed, but Pages finished with " + str(conclusion) + ". Inspect " + latest["html_url"])
        elif previous != "waiting":
            print("Waiting for GitHub to start the Pages workflow for this commit…", flush=True)
            previous = "waiting"
        time.sleep(10)
    raise UpdateError("The code was pushed. Pages is still pending after 15 minutes. Check https://github.com/" + REPOSITORY + "/actions before running another update.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare-only", action="store_true", help="Clone, apply and test the update without committing or pushing")
    args = parser.parse_args(argv)
    gh, git = shutil.which("gh"), shutil.which("git")
    if not gh or not git:
        raise UpdateError("This updater requires Git and the GitHub CLI. On your Mac, install gh with brew install gh, then run gh auth login.")
    profile = api(gh, "user")
    validate_identity(profile)
    repository = api(gh, "repos/" + REPOSITORY)
    validate_repository(repository)
    files = package_files()
    git_auth = [git, "-c", "credential.helper=", "-c", "credential.helper=!" + shlex.quote(gh) + " auth git-credential"]
    with tempfile.TemporaryDirectory(prefix="ai4theology-update-") as temporary:
        checkout = Path(temporary) / "repository"
        print("Preparing " + REPOSITORY + " from its current main branch…", flush=True)
        run(git_auth + ["clone", "--quiet", "--single-branch", "--branch", BRANCH, ORIGIN, str(checkout)], timeout=180)
        validate_origin(run([git, "remote", "get-url", "--push", "origin"], cwd=checkout))
        overlay(files, checkout)
        print("Rebuilding and checking the complete edition…", flush=True)
        for script in ("scripts/build_data.py", "scripts/build_edition.py"):
            output = run([sys.executable, script], cwd=checkout)
            if output:
                print(output, flush=True)
        output = run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"], cwd=checkout)
        if output:
            print(output, flush=True)
        print("All edition checks passed.", flush=True)
        run([git, "add", "--", *[str(path.relative_to(ROOT)) for path in files]], cwd=checkout)
        changes = run([git, "diff", "--cached", "--stat"], cwd=checkout)
        if changes:
            print(changes, flush=True)
        if args.prepare_only:
            print("Preparation complete. No commit or upload was made.")
            return 0
        if changes:
            run([git, "-c", "user.name=" + OWNER, "-c", "user.email=" + str(profile["id"]) + "+" + OWNER + "@users.noreply.github.com", "commit", "-m", "Publish complete synoptic edition with inquiry maps"], cwd=checkout)
            validate_origin(run([git, "remote", "get-url", "--push", "origin"], cwd=checkout))
            print("Uploading the verified edition…", flush=True)
            run(git_auth + ["push", "origin", "HEAD:refs/heads/" + BRANCH], cwd=checkout, timeout=180)
        else:
            print("The repository already contains this edition.", flush=True)
        commit = run([git, "rev-parse", "HEAD"], cwd=checkout)
        print("Commit: https://github.com/" + REPOSITORY + "/commit/" + commit, flush=True)
    after_run_id = 0
    if not changes:
        # Wait for the new dispatch, rather than interpreting an earlier failed run.
        previous = api(gh, f"repos/{REPOSITORY}/actions/workflows/{WORKFLOW}/runs?head_sha={commit}&per_page=30")
        after_run_id = max((run["id"] for run in previous.get("workflow_runs", [])), default=0)
        run([gh, "workflow", "run", WORKFLOW, "--repo", REPOSITORY, "--ref", BRANCH])
    wait_for_pages(gh, commit, after_run_id=after_run_id)
    pages = api(gh, "repos/" + REPOSITORY + "/pages")
    url = pages.get("html_url")
    if not url or not url.startswith("https://"):
        raise UpdateError("The Pages workflow succeeded, but GitHub did not return an HTTPS site URL.")
    print("Published: " + url, flush=True)
    webbrowser.open(url)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (UpdateError, OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print("Update stopped: " + str(exc), file=sys.stderr)
        raise SystemExit(1)
