"""GitHub PR ingestion — reads merged pull requests via the gh CLI.

Uses `gh pr list --json` with subprocess, same pattern as git_reader.
Gracefully returns an empty list if gh is not available or the repo
has no GitHub remote.

Assumptions:
- `gh` CLI is optional — PR analysis is skipped if unavailable
- repo must have a GitHub remote (origin) for PR fetching to work
- Only merged PRs are fetched (state=merged)
"""

import json
import re
import shutil
import subprocess
from datetime import datetime, timedelta, timezone

from iris.models.pull_request import PRReview, PullRequest


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


_PR_FIELDS_BASIC = "number,title,createdAt,mergedAt,additions,deletions,changedFiles,author"
_PR_FIELDS_FULL = "number,title,createdAt,mergedAt,additions,deletions,changedFiles,author,reviews,commits"

# Maximum PRs to fetch in a single gh call. Larger requests with the reviews
# field can trigger GitHub GraphQL 504 timeouts (observed on repos with
# verbose review bodies like copilot/bot reviews).
_BATCH_SIZE = 500


def _fetch_prs(nwo: str, limit: int) -> list[dict]:
    """Fetch merged PRs via gh CLI, falling back to a two-pass strategy.

    First attempts a single call with full fields (including reviews).
    If that fails (504 timeout from large review payloads), falls back to:
    1. Fetch basic PR metadata (no reviews) — lightweight, reliable
    2. Fetch reviews separately in smaller batches and merge them in
    """
    # Try full fetch first (works for most repos)
    if limit <= _BATCH_SIZE:
        result = _gh_pr_list(nwo, _PR_FIELDS_FULL, limit)
        if result is not None:
            return result

    # For large limits or when single fetch fails: two-pass strategy.
    # Pass 1: basic metadata (no reviews — never times out)
    prs = _gh_pr_list(nwo, _PR_FIELDS_BASIC, limit)
    if prs is None:
        return []

    # Pass 2: fetch reviews in smaller batches and merge by PR number
    reviews_prs = _gh_pr_list(nwo, "number,reviews", min(limit, _BATCH_SIZE))
    if reviews_prs:
        reviews_by_number = {pr["number"]: pr.get("reviews", []) for pr in reviews_prs}
        for pr in prs:
            pr["reviews"] = reviews_by_number.get(pr["number"], [])

    return prs


def _gh_pr_list(nwo: str, fields: str, limit: int) -> list[dict] | None:
    """Run gh pr list and return parsed JSON, or None on failure."""
    try:
        result = subprocess.run(
            [
                "gh", "pr", "list",
                "--repo", nwo,
                "--state", "merged",
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
    """Read merged pull requests from GitHub via gh CLI.

    Args:
        repo_path: Absolute path to a Git repository with a GitHub remote.
        days: Number of days to look back from now.

    Returns:
        List of PullRequest objects for PRs merged within the window.
        Returns empty list if gh is unavailable or repo has no GitHub remote.
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

    raw_prs = _fetch_prs(nwo, fetch_limit)
    if not raw_prs:
        return []

    return _parse_pull_requests(raw_prs, since)


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
    merged_at_str = raw.get("mergedAt", "")

    if not created_at_str:
        return None

    created_at = _parse_datetime(created_at_str)
    merged_at = _parse_datetime(merged_at_str) if merged_at_str else created_at

    reviews = _parse_reviews(raw.get("reviews", []))
    commit_hashes = _parse_commit_hashes(raw.get("commits", []))

    author = raw.get("author", {})
    author_login = author.get("login", "") if isinstance(author, dict) else ""

    return PullRequest(
        number=raw.get("number", pr_number),
        title=raw.get("title", ""),
        author=author_login,
        created_at=created_at,
        merged_at=merged_at,
        additions=raw.get("additions", 0),
        deletions=raw.get("deletions", 0),
        changed_files=raw.get("changedFiles", 0),
        reviews=reviews,
        commit_hashes=commit_hashes,
    )


def _parse_pull_requests(
    raw_prs: list[dict],
    since: datetime,
) -> list[PullRequest]:
    """Parse gh JSON output into PullRequest objects, filtering by date."""
    prs = []

    for raw in raw_prs:
        merged_at_str = raw.get("mergedAt")
        if not merged_at_str:
            continue

        merged_at = _parse_datetime(merged_at_str)
        if merged_at < since:
            continue

        created_at = _parse_datetime(raw.get("createdAt", merged_at_str))

        reviews = _parse_reviews(raw.get("reviews", []))
        commit_hashes = _parse_commit_hashes(raw.get("commits", []))

        author = raw.get("author", {})
        author_login = author.get("login", "") if isinstance(author, dict) else ""

        prs.append(PullRequest(
            number=raw.get("number", 0),
            title=raw.get("title", ""),
            author=author_login,
            created_at=created_at,
            merged_at=merged_at,
            additions=raw.get("additions", 0),
            deletions=raw.get("deletions", 0),
            changed_files=raw.get("changedFiles", 0),
            reviews=reviews,
            commit_hashes=commit_hashes,
        ))

    # Sort by merged date ascending (oldest first)
    prs.sort(key=lambda p: p.merged_at)
    return prs


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


def _parse_commit_hashes(raw_commits: list[dict]) -> list[str]:
    """Parse commit OIDs from gh JSON commits field."""
    hashes = []
    for raw in raw_commits:
        oid = raw.get("oid", "")
        if oid:
            hashes.append(oid)
    return hashes


def _parse_datetime(date_str: str) -> datetime:
    """Parse ISO-8601 datetime string from GitHub API.

    GitHub returns dates like "2024-01-15T10:30:00Z".
    """
    # Handle 'Z' suffix (GitHub convention)
    if date_str.endswith("Z"):
        date_str = date_str[:-1] + "+00:00"
    return datetime.fromisoformat(date_str)
