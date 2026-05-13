"""Acceptance rate — measure code review survival by origin and AI tool.

Crosses origin/tool classification with PR merge data to compute:
- What % of commits by each origin went through a PR (vs direct push)
- Of those in PRs, what % were in single-pass PRs (no CHANGES_REQUESTED)
- Breakdown by specific AI tool (Copilot, Claude, Cursor, etc.)

Requires PR data with commit refs (commit_refs field on PullRequest).
Falls back gracefully when PR data is unavailable.
"""

from collections import defaultdict
from dataclasses import dataclass
from statistics import median

from iris.analysis.origin_classifier import CommitOrigin, classify_origin, detect_tool
from iris.models.commit import Commit
from iris.models.pull_request import PullRequest


@dataclass(frozen=True)
class AcceptanceByGroup:
    """Acceptance metrics for a single group (origin or tool)."""

    group: str                  # origin value or tool name
    total_commits: int
    commits_in_prs: int
    pr_rate: float              # commits_in_prs / total_commits
    single_pass_commits: int    # commits in PRs with no CHANGES_REQUESTED
    single_pass_rate: float     # single_pass_commits / commits_in_prs
    median_review_rounds: float


@dataclass(frozen=True)
class AcceptanceResult:
    """Complete acceptance rate analysis."""

    by_origin: list[AcceptanceByGroup]
    by_tool: list[AcceptanceByGroup]


# Minimum commits per group to report metrics.
MIN_COMMITS_PER_GROUP = 5


def calculate_acceptance_rate(
    commits: list[Commit],
    prs: list[PullRequest],
) -> AcceptanceResult | None:
    """Calculate code review acceptance rate by origin and AI tool.

    Args:
        commits: All commits sorted by date ascending.
        prs: Merged PRs with commit_refs populated.

    Returns:
        AcceptanceResult with per-origin and per-tool breakdown,
        or None if insufficient data.
    """
    if not commits or not prs:
        return None

    # Build PR lookup: commit_hash -> PullRequest. Acceptance is defined
    # against merged PRs only — commits in still-open or closed-without-merge
    # PRs were not yet accepted.
    hash_to_pr: dict[str, PullRequest] = {}
    for pr in prs:
        if pr.state != "merged":
            continue
        for ref in pr.commit_refs:
            hash_to_pr[ref.hash] = pr

    # Classify each commit and track PR association
    origin_stats: dict[str, _GroupStats] = defaultdict(_GroupStats)
    tool_stats: dict[str, _GroupStats] = defaultdict(_GroupStats)

    for commit in commits:
        if commit.is_merge:
            continue

        origin = classify_origin(commit)
        if origin == CommitOrigin.BOT:
            continue

        origin_key = origin.value
        tool = detect_tool(commit) if origin == CommitOrigin.AI_ASSISTED else None

        # Find if this commit is in a merged PR
        pr = _find_pr(commit.hash, hash_to_pr)

        # Update origin stats
        origin_stats[origin_key].total += 1
        if pr is not None:
            review_rounds = sum(1 for r in pr.reviews if r.state == "CHANGES_REQUESTED")
            is_single_pass = review_rounds == 0
            origin_stats[origin_key].in_pr += 1
            origin_stats[origin_key].review_rounds.append(review_rounds)
            if is_single_pass:
                origin_stats[origin_key].single_pass += 1

        # Update tool stats (only for AI_ASSISTED with detected tool)
        if tool:
            tool_stats[tool].total += 1
            if pr is not None:
                review_rounds = sum(1 for r in pr.reviews if r.state == "CHANGES_REQUESTED")
                is_single_pass = review_rounds == 0
                tool_stats[tool].in_pr += 1
                tool_stats[tool].review_rounds.append(review_rounds)
                if is_single_pass:
                    tool_stats[tool].single_pass += 1

    # Build results
    by_origin = _build_groups(origin_stats)
    by_tool = _build_groups(tool_stats)

    if not by_origin:
        return None

    return AcceptanceResult(
        by_origin=by_origin,
        by_tool=by_tool,
    )


class _GroupStats:
    """Mutable accumulator for acceptance metrics."""

    def __init__(self):
        self.total = 0
        self.in_pr = 0
        self.single_pass = 0
        self.review_rounds: list[int] = []


def _build_groups(stats: dict[str, _GroupStats]) -> list[AcceptanceByGroup]:
    """Convert accumulated stats into frozen result objects."""
    results = []
    for group, s in sorted(stats.items()):
        if s.total < MIN_COMMITS_PER_GROUP:
            continue
        pr_rate = s.in_pr / s.total if s.total > 0 else 0.0
        sp_rate = s.single_pass / s.in_pr if s.in_pr > 0 else 0.0
        med_rounds = median(s.review_rounds) if s.review_rounds else 0.0

        results.append(AcceptanceByGroup(
            group=group,
            total_commits=s.total,
            commits_in_prs=s.in_pr,
            pr_rate=round(pr_rate, 3),
            single_pass_commits=s.single_pass,
            single_pass_rate=round(sp_rate, 3),
            median_review_rounds=round(med_rounds, 1),
        ))
    return results


def _find_pr(commit_hash: str, hash_to_pr: dict[str, PullRequest]) -> PullRequest | None:
    """Find the PR containing a commit hash, handling abbreviated hashes."""
    if commit_hash in hash_to_pr:
        return hash_to_pr[commit_hash]

    # Try prefix matching (git log may use abbreviated hashes)
    for pr_hash, pr in hash_to_pr.items():
        if pr_hash.startswith(commit_hash) or commit_hash.startswith(pr_hash):
            return pr

    return None
