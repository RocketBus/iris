#!/usr/bin/env python3
"""Clone active org repos and run `iris` in each, same as running it by hand.

Chains with list_active_repos.py: pulls the same "active in the last N days"
repo set, clones any repo not already present under --dest (or fast-forward
pulls it if it is), then runs the `iris` CLI inside each repo directory with
no extra flags — identical to a manual `cd <repo> && iris` — so metrics push
to the Iris platform per the account's existing `iris login` session.

One repo failing (clone conflict, analysis error) does not stop the run; a
summary of successes/failures prints at the end.

Requires: `gh` authenticated for the target org, `iris` installed and logged
in (`iris auth status`) if you want the push-to-platform behavior.

Usage:
    python scripts/clone_and_analyze.py --org my-org [--days 90]
        [--dest ~/git/iris-repos] [--limit N] [--include-archived] [--cleanup]

Exit codes:
    0 — every repo cloned/updated and analyzed successfully
    1 — could not fetch the repo list
    2 — one or more repos failed to clone/update or analyze (see summary)
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

from list_active_repos import CANONICAL_WINDOWS, get_active_repos


def sync_repo(name_with_owner: str, dest_dir: Path) -> bool:
    """Clone the repo into dest_dir, or fast-forward pull if already present."""
    if dest_dir.exists():
        print("  pulling...")
        result = subprocess.run(
            ["git", "-C", str(dest_dir), "pull", "--ff-only"],
            capture_output=True,
            text=True,
        )
    else:
        print("  cloning...")
        result = subprocess.run(
            ["gh", "repo", "clone", name_with_owner, str(dest_dir)],
            capture_output=True,
            text=True,
        )
    if result.returncode != 0:
        stderr = result.stderr.strip()
        if "Could not resolve to a Repository" in stderr:
            print(
                "  ✗ sync failed: repo not found — likely renamed, deleted, "
                "or transferred out of the org during this run",
                file=sys.stderr,
            )
        else:
            print(f"  ✗ sync failed: {stderr}", file=sys.stderr)
        return False
    return True


def run_iris(repo_dir: Path) -> bool:
    print("  running iris...")
    result = subprocess.run(["iris", "."], cwd=repo_dir, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ✗ iris failed: {result.stderr.strip()}", file=sys.stderr)
        return False
    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org", required=True, help="GitHub org or user to scan, e.g. 'my-org'")
    parser.add_argument(
        "--days",
        type=int,
        default=90,
        choices=CANONICAL_WINDOWS,
        help=f"lookback window in days, one of {CANONICAL_WINDOWS} (default: 90)",
    )
    parser.add_argument(
        "--dest",
        default="~/git/iris-repos",
        help="directory to clone repos into (default: ~/git/iris-repos)",
    )
    parser.add_argument("--limit", type=int, default=None, help="only process the first N repos (for a pilot run)")
    parser.add_argument("--include-archived", action="store_true", help="include archived repos")
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="remove successfully processed repo clones from --dest after the run "
        "(frees disk; failed repos are kept for investigation)",
    )
    return parser.parse_args()


def main() -> int:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)

    args = parse_args()
    dest_root = Path(args.dest).expanduser().resolve()
    dest_root.mkdir(parents=True, exist_ok=True)

    active = get_active_repos(args.org, args.days, args.include_archived)
    if args.limit is not None:
        active = active[: args.limit]

    print(f"Processing {len(active)} repo(s) into {dest_root}\n")

    succeeded, failed = [], []
    for i, repo in enumerate(active, 1):
        name = repo["nameWithOwner"]
        repo_dir = dest_root / name.split("/", 1)[1]
        print(f"[{i}/{len(active)}] {name}")

        if not sync_repo(name, repo_dir):
            failed.append(name)
            continue
        if not run_iris(repo_dir):
            failed.append(name)
            continue
        succeeded.append(name)

    print(f"\n{len(succeeded)} succeeded, {len(failed)} failed")
    if failed:
        print("Failed repos:")
        for name in failed:
            print(f"  {name}")

    if args.cleanup:
        for name in succeeded:
            shutil.rmtree(dest_root / name.split("/", 1)[1], ignore_errors=True)
        print(f"\nCleaned up {len(succeeded)} repo(s) from {dest_root}")

    return 0 if not failed else 2


if __name__ == "__main__":
    sys.exit(main())
