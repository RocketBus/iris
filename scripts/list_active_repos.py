#!/usr/bin/env python3
"""List org repos active in the last N days, or stale beyond N days.

Uses `gh repo list` and treats GitHub's `pushedAt` timestamp as a proxy for
"had a commit" — any push (commits, tags, force-pushes) bumps it. That is
close enough for a lookback filter without paying for a per-repo commits
API call, and matches how Iris already treats repo-level recency elsewhere.

Requires the GitHub CLI (`gh`) authenticated with access to the target org.

Usage:
    python scripts/list_active_repos.py --org my-org [--days 90]
        [--stale] [--include-archived] [--json]

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


def get_repos_by_activity(
    org: str, days: int, include_archived: bool = False, stale: bool = False
) -> list[dict]:
    """Return repos in `org` pushed within the last `days` days — or, with
    `stale=True`, repos NOT pushed to in over `days` days (including repos
    that have never been pushed to at all).

    Each dict carries `pushedAt` as a parsed datetime, or `None` for a repo
    with no recorded push. Active repos sort newest-first; stale repos sort
    oldest (most neglected) first, with never-pushed repos at the very front.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    matched = []
    for repo in fetch_repos(org):
        if repo["isArchived"] and not include_archived:
            continue
        pushed_at = (
            datetime.fromisoformat(repo["pushedAt"].replace("Z", "+00:00"))
            if repo["pushedAt"]
            else None
        )
        if stale:
            if pushed_at is None or pushed_at < cutoff:
                matched.append({**repo, "pushedAt": pushed_at})
        elif pushed_at is not None and pushed_at >= cutoff:
            matched.append({**repo, "pushedAt": pushed_at})

    epoch = datetime.min.replace(tzinfo=timezone.utc)
    matched.sort(key=lambda r: r["pushedAt"] or epoch, reverse=not stale)
    return matched


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
        "--stale",
        action="store_true",
        help="show repos NOT pushed to in over --days days, instead of active ones",
    )
    parser.add_argument("--include-archived", action="store_true", help="include archived repos")
    parser.add_argument("--json", action="store_true", help="emit JSON instead of a table")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repos = get_repos_by_activity(args.org, args.days, args.include_archived, args.stale)

    if args.json:
        print(json.dumps(
            [{**r, "pushedAt": r["pushedAt"].isoformat() if r["pushedAt"] else None} for r in repos],
            indent=2,
        ))
    else:
        if args.stale:
            print(f"{len(repos)} repo(s) with no push in over {args.days} days (org: {args.org})\n")
        else:
            print(f"{len(repos)} repo(s) active in the last {args.days} days (org: {args.org})\n")
        for r in repos:
            tag = "  (archived)" if r["isArchived"] else ""
            when = r["pushedAt"].date() if r["pushedAt"] else "never pushed"
            print(f"  {when}  {r['nameWithOwner']}{tag}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
