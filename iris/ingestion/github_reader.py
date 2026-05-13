"""GitHub PR ingestion — reads pull requests via the gh CLI.

Uses `gh pr list --json` with subprocess, same pattern as git_reader.
Gracefully returns an empty list if gh is not available or the repo
has no GitHub remote.

Fetches PRs in three states: merged, closed-without-merge, and open.
This is required for Flow Load (WIP) analysis, which needs to count
PRs whose lifecycle overlaps with each time bucket — not just the
ones that ended up merged.

Assumptions:
- `gh` CLI is optional — PR analysis is skipped if unavailable
- repo must have a GitHub remote (origin) for PR fetching to work
"""

import json
import re
import shutil
import subprocess
from datetime import datetime, timedelta, timezone

from iris.models.pull_request import CommitRef, PRReview, PRState, PullRequest


def detect_github_remote(repo_path: str) -> str | None:
    """Extract owner/repo from the Git remote URL.

    Parses `git remote -v` output and looks for a GitHub remote.
    Supports both HTTPS and SSH URL formats.

    Returns:
        "owner/repo" string, or None if no GitHub remote found.
    """
    try:
        result = subprocess.run(
            ["git", "-C", repo_path, "remote", "-v"],
            capture_output=True,
            text=True,
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None

    # Match GitHub URLs in both SSH and HTTPS formats
    # SSH:   git@github.com:owner/repo.git (fetch)
    # HTTPS: https://github.com/owner/repo.git (fetch)
    patterns = [
        re.compile(r"github\.com[:/]([^/]+/[^/\s]+?)(?:\.git)?\s"),
    ]

    for line in result.stdout.splitlines():
        for pattern in patterns:
            match = pattern.search(line)
            if match:
                return match.group(1)

    return None


def is_gh_available() -> bool:
    """Check if the GitHub CLI (gh) is installed and on PATH."""
    return shutil.which("gh") is not None


# NOTE: `commits` MUST stay in the BASIC field list. The two-pass fallback
# below only re-fetches `reviews` — leaving `commits` out of pass 1 made
# busy-repo analyses (fetch_limit > _BATCH_SIZE) return PRs with no
# commit_refs, which silently broke flow_efficiency (no first_commit_at
# anchor) and acceptance_by_origin (no commit→PR linkage). Reviews are the
# only field that triggers GraphQL 504s on verbose-reviewer repos; commits
# are safe.
_PR_FIELDS_BASIC = (
    "number,title,createdAt,mergedAt,closedAt,state,"
    "additions,deletions,changedFiles,author,commits"
)
_PR_FIELDS_FULL = (
    "number,title,createdAt,mergedAt,closedAt,state,"
    "additions,deletions,changedFiles,author,reviews,commits"
)

# Maximum PRs to fetch in a single gh call. Larger requests with the reviews
# field can trigger GitHub GraphQL 504 timeouts (observed on repos with
# verbose review bodies like copilot/bot reviews).
_BATCH_SIZE = 500


def _fetch_prs(nwo: str, limit: int, gh_state: str) -> list[dict]:
    """Fetch PRs in a given gh state, falling back to a two-pass strategy.

    First attempts a single call with full fields (including reviews).
    If that fails (504 timeout from large review payloads), falls back to:
    1. Fetch basic PR metadata (no reviews) — lightweight, reliable
    2. Fetch reviews separately in smaller batches and merge them in
    """
    if limit <= _BATCH_SIZE:
        result = _gh_pr_list(nwo, _PR_FIELDS_FULL, limit, gh_state)
        if result is not None:
            return result

    prs = _gh_pr_list(nwo, _PR_FIELDS_BASIC, limit, gh_state)
    if prs is None:
        return []

    reviews_prs = _gh_pr_list(nwo, "number,reviews", min(limit, _BATCH_SIZE), gh_state)
    if reviews_prs:
        reviews_by_number = {pr["number"]: pr.get("reviews", []) for pr in reviews_prs}
        for pr in prs:
            pr["reviews"] = reviews_by_number.get(pr["number"], [])

    return prs


def _gh_pr_list(nwo: str, fields: str, limit: int, gh_state: str) -> list[dict] | None:
    """Run gh pr list and return parsed JSON, or None on failure."""
    try:
        result = subprocess.run(
            [
                "gh", "pr", "list",
                "--repo", nwo,
                "--state", gh_state,
                "--json", fields,
                "--limit", str(limit),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None

    if not result.stdout.strip():
        return None

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def read_pull_requests(repo_path: str, days: int) -> list[PullRequest]:
    """Read pull requests from GitHub via gh CLI.

    Fetches PRs in all three lifecycle states (merged, closed-without-merge,
    open). A PR is kept when its lifecycle overlaps the analysis window:
        created_at < now AND
        NOT (merged_at < since) AND
        NOT (closed_at < since)

    Args:
        repo_path: Absolute path to a Git repository with a GitHub remote.
        days: Number of days to look back from now.

    Returns:
        List of PullRequest objects with state populated. Returns an empty
        list if gh is unavailable or the repo has no GitHub remote.
    """
    if not is_gh_available():
        return []

    nwo = detect_github_remote(repo_path)
    if not nwo:
        return []

    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Scale fetch limit with analysis window. The gh CLI handles pagination
    # internally (100 per API call). Previous hardcoded 300 caused truncation
    # on active repos (e.g., vercel/ai, vercel/next.js all capped at 300).
    fetch_limit = max(500, days * 15)

    # gh's --state semantics:
    #   open   — still open
    #   closed — closed without merging (NOT including merged)
    #   merged — merged
    merged_raw = _fetch_prs(nwo, fetch_limit, "merged")
    closed_raw = _fetch_prs(nwo, fetch_limit, "closed")
    open_raw = _fetch_prs(nwo, fetch_limit, "open")

    return _parse_pull_requests(merged_raw + closed_raw + open_raw, since)


def read_single_pr(repo_path: str, pr_number: int) -> PullRequest | None:
    """Read a single pull request from GitHub via gh CLI.

    Works on open, closed, and merged PRs — not limited to merged state.

    Args:
        repo_path: Absolute path to a Git repository with a GitHub remote.
        pr_number: The PR number to fetch.

    Returns:
        PullRequest object, or None if gh is unavailable, no GitHub remote,
        or the PR was not found.
    """
    if not is_gh_available():
        return None

    nwo = detect_github_remote(repo_path)
    if not nwo:
        return None

    try:
        result = subprocess.run(
            [
                "gh", "pr", "view", str(pr_number),
                "--repo", nwo,
                "--json", _PR_FIELDS_FULL,
            ],
            capture_output=True,
            text=True,
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None

    if not result.stdout.strip():
        return None

    try:
        raw = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None

    created_at_str = raw.get("createdAt", "")
    if not created_at_str:
        return None

    created_at = _parse_datetime(created_at_str)
    merged_at = _parse_datetime(raw["mergedAt"]) if raw.get("mergedAt") else None
    closed_at = _parse_datetime(raw["closedAt"]) if raw.get("closedAt") else None
    state = _infer_state(raw.get("state"), merged_at, closed_at)

    reviews = _parse_reviews(raw.get("reviews", []))
    commit_refs = _parse_commit_refs(raw.get("commits", []))

    author = raw.get("author", {})
    author_login = author.get("login", "") if isinstance(author, dict) else ""

    return PullRequest(
        number=raw.get("number", pr_number),
        title=raw.get("title", ""),
        author=author_login,
        created_at=created_at,
        merged_at=merged_at,
        closed_at=closed_at,
        state=state,
        additions=raw.get("additions", 0),
        deletions=raw.get("deletions", 0),
        changed_files=raw.get("changedFiles", 0),
        reviews=reviews,
        commit_refs=commit_refs,
    )


def _parse_pull_requests(
    raw_prs: list[dict],
    since: datetime,
) -> list[PullRequest]:
    """Parse gh JSON output into PullRequest objects, filtering by window overlap."""
    prs = []
    seen: set[int] = set()

    for raw in raw_prs:
        number = raw.get("number", 0)
        if number in seen:
            continue

        created_at_str = raw.get("createdAt")
        if not created_at_str:
            continue
        created_at = _parse_datetime(created_at_str)

        merged_at = _parse_datetime(raw["mergedAt"]) if raw.get("mergedAt") else None
        closed_at = _parse_datetime(raw["closedAt"]) if raw.get("closedAt") else None
        state = _infer_state(raw.get("state"), merged_at, closed_at)

        # Window-overlap filter: drop PRs that finished before the window began.
        if merged_at is not None and merged_at < since:
            continue
        if state == "closed" and closed_at is not None and closed_at < since:
            continue

        reviews = _parse_reviews(raw.get("reviews", []))
        commit_refs = _parse_commit_refs(raw.get("commits", []))

        author = raw.get("author", {})
        author_login = author.get("login", "") if isinstance(author, dict) else ""

        prs.append(PullRequest(
            number=number,
            title=raw.get("title", ""),
            author=author_login,
            created_at=created_at,
            merged_at=merged_at,
            closed_at=closed_at,
            state=state,
            additions=raw.get("additions", 0),
            deletions=raw.get("deletions", 0),
            changed_files=raw.get("changedFiles", 0),
            reviews=reviews,
            commit_refs=commit_refs,
        ))
        seen.add(number)

    # Sort by created_at ascending (oldest first) — preserves a stable order
    # across the mixed-state result set, where merged_at may be None.
    prs.sort(key=lambda p: p.created_at)
    return prs


def _infer_state(
    gh_state: str | None,
    merged_at: datetime | None,
    closed_at: datetime | None,
) -> PRState:
    """Map gh's uppercase state string to our lowercase Literal.

    Falls back to inferring from merged_at/closed_at when gh did not supply
    a usable state value.
    """
    if gh_state:
        normalized = gh_state.lower()
        if normalized in ("open", "closed", "merged"):
            return normalized  # type: ignore[return-value]
    if merged_at is not None:
        return "merged"
    if closed_at is not None:
        return "closed"
    return "open"


def _parse_reviews(raw_reviews: list[dict]) -> list[PRReview]:
    """Parse review entries from gh JSON."""
    reviews = []
    for raw in raw_reviews:
        state = raw.get("state", "")
        author = raw.get("author", {})
        author_login = author.get("login", "") if isinstance(author, dict) else ""
        submitted_at_str = raw.get("submittedAt", "")

        if not submitted_at_str:
            continue

        reviews.append(PRReview(
            author=author_login,
            state=state,
            submitted_at=_parse_datetime(submitted_at_str),
        ))

    return reviews


def _parse_commit_refs(raw_commits: list[dict]) -> list[CommitRef]:
    """Parse commit refs (oid + timestamps) from gh JSON commits field.

    gh exposes ``committedDate`` and ``authoredDate`` per commit in the
    PR's commit list. Both are optional in the JSON; ``hash`` is the
    only required field.
    """
    refs: list[CommitRef] = []
    for raw in raw_commits:
        oid = raw.get("oid", "")
        if not oid:
            continue
        committed = raw.get("committedDate")
        authored = raw.get("authoredDate")
        refs.append(CommitRef(
            hash=oid,
            committed_at=_parse_datetime(committed) if committed else None,
            authored_at=_parse_datetime(authored) if authored else None,
        ))
    return refs


def _parse_datetime(date_str: str) -> datetime:
    """Parse ISO-8601 datetime string from GitHub API.

    GitHub returns dates like "2024-01-15T10:30:00Z".
    """
    if date_str.endswith("Z"):
        date_str = date_str[:-1] + "+00:00"
    return datetime.fromisoformat(date_str)
