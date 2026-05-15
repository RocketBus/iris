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


# `commits` and `reviews` are NOT in BASIC. They're both fetched via
# secondary passes in `_fetch_prs` below because gh's default GraphQL
# query for `commits` requests heavy author connections (`authors.user.
# {id,login,email,name}`) that explode the 500K-nodes budget on busy
# repos — even at limits as low as 50 PRs on commit-heavy repos. The
# commits secondary pass uses a custom light GraphQL query
# (`oid + committedDate + authoredDate` only) via
# `_fetch_commit_refs_by_pr_graphql`.
_PR_FIELDS_BASIC = (
    "number,title,createdAt,mergedAt,closedAt,state,isDraft,"
    "additions,deletions,changedFiles,author"
)
_PR_FIELDS_FULL = (
    "number,title,createdAt,mergedAt,closedAt,state,isDraft,"
    "additions,deletions,changedFiles,author,reviews,commits"
)

# Maximum PRs to fetch in a single gh call. Larger requests with the reviews
# field can trigger GitHub GraphQL 504 timeouts (observed on repos with
# verbose review bodies like copilot/bot reviews).
_BATCH_SIZE = 500


def _fetch_prs(nwo: str, limit: int, gh_state: str) -> list[dict]:
    """Fetch PRs in a given gh state.

    For limits at or below `_BATCH_SIZE`, attempts a one-shot fetch with
    `_PR_FIELDS_FULL` (everything in a single call). On busy repos that
    fetch fails — gh's default `commits` subtree requests heavy author
    connections that overflow GitHub's 500K-nodes GraphQL budget. In that
    case (and whenever the limit exceeds `_BATCH_SIZE`), fall back to a
    three-pass strategy:

    1. Basic metadata via `gh pr list --json <BASIC>` — small enough to
       always succeed.
    2. Commit refs via `gh api graphql` with a *light* query (oid +
       committedDate + authoredDate only, no author connections),
       paginating with cursors. Capped at `_BATCH_SIZE` PRs.
    3. Reviews via `gh pr list --json number,reviews` in one shot, also
       capped at `_BATCH_SIZE`.

    Both secondary passes are best-effort — if either fails the PRs come
    back with the respective field empty, but the rest of the metadata
    is still usable.
    """
    if limit <= _BATCH_SIZE:
        result = _gh_pr_list(nwo, _PR_FIELDS_FULL, limit, gh_state)
        if result is not None:
            return result

    prs = _gh_pr_list(nwo, _PR_FIELDS_BASIC, limit, gh_state)
    if prs is None:
        return []

    commits_by_pr = _fetch_commit_refs_by_pr_graphql(
        nwo, gh_state, min(limit, _BATCH_SIZE),
    )
    for pr in prs:
        pr["commits"] = commits_by_pr.get(pr["number"], [])

    reviews_prs = _gh_pr_list(nwo, "number,reviews", min(limit, _BATCH_SIZE), gh_state)
    if reviews_prs:
        reviews_by_number = {pr["number"]: pr.get("reviews", []) for pr in reviews_prs}
        for pr in prs:
            pr["reviews"] = reviews_by_number.get(pr["number"], [])

    return prs


# Max PRs per GraphQL page. GitHub's REST/GraphQL API rejects `first:`
# values above 100 with an EXCESSIVE_PAGINATION error. We page until we
# reach the requested cap.
_GRAPHQL_PAGE_SIZE = 100

_COMMITS_GRAPHQL_QUERY = """
query($owner:String!,$name:String!,$states:[PullRequestState!]!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequests(
      first:%d,
      after:$cursor,
      states:$states,
      orderBy:{field:CREATED_AT,direction:DESC}
    ){
      pageInfo{endCursor hasNextPage}
      nodes{
        number
        commits(first:100){
          nodes{commit{oid committedDate authoredDate}}
        }
      }
    }
  }
}
""" % _GRAPHQL_PAGE_SIZE


_GH_STATE_TO_GRAPHQL = {
    "open": "OPEN",
    "closed": "CLOSED",
    "merged": "MERGED",
}


def _fetch_commit_refs_by_pr_graphql(
    nwo: str,
    gh_state: str,
    max_prs: int,
) -> dict[int, list[dict]]:
    """Map PR number → light commit dicts via paginated GraphQL.

    Why this exists: `gh pr list --json commits` is unusable on busy
    repos — gh's default commit subtree pulls `commit.authors.user.
    {id,login,email,name}`, which explodes the 500K-nodes GraphQL budget
    even at small page sizes. This helper asks only for the fields the
    rest of the pipeline actually needs (oid + the two datetimes).

    Returns ``{pr_number → [{"oid": ..., "committedDate": ...,
    "authoredDate": ...}, ...]}``. Per-PR commit cap is 100 (the gh API
    `first:` ceiling); PRs with more commits than that lose the older
    entries — documented limitation that the caller should be aware of.

    Best-effort: returns whatever it has collected so far on any error.
    """
    try:
        owner, name = nwo.split("/", 1)
    except ValueError:
        return {}

    graphql_state = _GH_STATE_TO_GRAPHQL.get(gh_state)
    if graphql_state is None:
        return {}

    refs_by_pr: dict[int, list[dict]] = {}
    end_cursor: str | None = None

    while len(refs_by_pr) < max_prs:
        args = [
            "gh", "api", "graphql",
            "-f", "query=" + _COMMITS_GRAPHQL_QUERY,
            "-F", f"owner={owner}",
            "-F", f"name={name}",
            "-f", f"states[]={graphql_state}",
        ]
        if end_cursor:
            args.extend(["-F", f"cursor={end_cursor}"])

        try:
            result = subprocess.run(
                args, capture_output=True, text=True, check=True,
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            return refs_by_pr

        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError:
            return refs_by_pr

        page = (
            data.get("data", {})
            .get("repository", {})
            .get("pullRequests")
            if data.get("data") else None
        )
        if not page:
            return refs_by_pr

        for node in page.get("nodes", []):
            number = node.get("number")
            if number is None:
                continue
            commits = []
            for entry in node.get("commits", {}).get("nodes", []):
                commit = entry.get("commit") or {}
                oid = commit.get("oid", "")
                if not oid:
                    continue
                commits.append({
                    "oid": oid,
                    "committedDate": commit.get("committedDate"),
                    "authoredDate": commit.get("authoredDate"),
                })
            refs_by_pr[number] = commits
            if len(refs_by_pr) >= max_prs:
                return refs_by_pr

        info = page.get("pageInfo", {}) or {}
        if not info.get("hasNextPage"):
            return refs_by_pr
        end_cursor = info.get("endCursor")
        if not end_cursor:
            return refs_by_pr

    return refs_by_pr


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
        is_draft=bool(raw.get("isDraft", False)),
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
            is_draft=bool(raw.get("isDraft", False)),
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
