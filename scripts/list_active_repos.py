#!/usr/bin/env python3
"""List org repos with activity in the last N days.

Uses `gh repo list` and treats GitHub's `pushedAt` timestamp as a proxy for
"had a commit" — any push (commits, tags, force-pushes) bumps it. That is
close enough for a lookback filter without paying for a per-repo commits
API call, and matches how Iris already treats repo-level recency elsewhere.

Requires the GitHub CLI (`gh`) authenticated with access to the target org.

Usage:
    python scripts/list_active_repos.py --org my-org [--days 90]
        [--include-archived] [--json]

Exit codes:
    0 — ran successfully (even if zero repos matched)
    1 — `gh` call failed or returned unparseable output
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone

FIELDS = "nameWithOwner,pushedAt,isArchived,isFork,url"

# Matches iris.cli.RECOMMENDED_WINDOWS — the canonical lookback windows the
# rest of Iris treats as standard for the platform's window selector.
CANONICAL_WINDOWS = (7, 15, 30, 60, 90)


def fetch_repos(org: str) -> list[dict]:
    result = subprocess.run(
        ["gh", "repo", "list", org, "--limit", "1000", "--json", FIELDS],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"error: gh repo list failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        print(f"error: could not parse gh output: {exc}", file=sys.stderr)
        sys.exit(1)


def get_active_repos(org: str, days: int, include_archived: bool = False) -> list[dict]:
    """Return repos in `org` pushed to within the last `days` days.

    Each dict carries `pushedAt` as a parsed datetime, newest first.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    active = []
    for repo in fetch_repos(org):
        if repo["isArchived"] and not include_archived:
            continue
        if not repo["pushedAt"]:
            continue
        pushed_at = datetime.fromisoformat(repo["pushedAt"].replace("Z", "+00:00"))
        if pushed_at >= cutoff:
            active.append({**repo, "pushedAt": pushed_at})

    active.sort(key=lambda r: r["pushedAt"], reverse=True)
    return active


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
    parser.add_argument("--include-archived", action="store_true", help="include archived repos")
    parser.add_argument("--json", action="store_true", help="emit JSON instead of a table")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    active = get_active_repos(args.org, args.days, args.include_archived)

    if args.json:
        print(json.dumps(
            [{**r, "pushedAt": r["pushedAt"].isoformat()} for r in active],
            indent=2,
        ))
    else:
        print(f"{len(active)} repo(s) active in the last {args.days} days (org: {args.org})\n")
        for r in active:
            print(f"  {r['pushedAt'].date()}  {r['nameWithOwner']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
