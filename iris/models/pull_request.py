"""Pull request data model for GitHub PR lifecycle analysis."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

PRState = Literal["open", "closed", "merged"]


@dataclass(frozen=True)
class PRReview:
    """A single review event on a pull request."""

    author: str
    state: str  # APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED
    submitted_at: datetime


@dataclass(frozen=True)
class CommitRef:
    """A reference to a commit included in a pull request.

    Carries the timestamps GitHub exposes per PR commit so analyses
    that depend on "first commit of the PR" (Flow Efficiency) don't need
    to re-query git locally.

    ``committed_at`` is the authoritative ordering field. ``authored_at``
    is kept for completeness (when the original author timestamp differs,
    e.g. rebased/cherry-picked work).

    ``subject`` is the commit's message headline (``messageHeadline`` from
    the GitHub API). It enables matching the GitHub squash default subject
    pattern ``(#<number>)`` used by Merge Strategy detection. Empty string
    when the field was not fetched (backward-compatible).
    """

    hash: str
    committed_at: datetime | None = None
    authored_at: datetime | None = None
    subject: str = ""


@dataclass(frozen=True)
class PullRequest:
    """A pull request with metadata and review history.

    state distinguishes between PRs that are still open, were closed
    without merging, or were merged. merged_at is only populated when
    state == "merged"; closed_at is populated when state in
    ("closed", "merged").

    Defaults preserve backward compatibility: callers that only set
    merged_at end up with state="merged" and closed_at=merged_at.
    """

    number: int
    title: str
    author: str
    created_at: datetime
    additions: int
    deletions: int
    changed_files: int
    merged_at: datetime | None = None
    closed_at: datetime | None = None
    state: PRState = "merged"
    is_draft: bool = False
    reviews: list[PRReview] = field(default_factory=list)
    commit_refs: list[CommitRef] = field(default_factory=list)

    # Merge-commit ground truth (optional — populated for merged PRs when the
    # GitHub API supplies it). ``merge_commit_sha`` is the SHA of the commit
    # that actually landed on the base branch; ``merge_commit_parent_count``
    # is that commit's parent count (2 → a true merge commit, 1 → squash or
    # rebase landing). Both are None for non-merged PRs or when unavailable.
    # Consumed by Merge Strategy detection (see merge_strategy_detector.py).
    merge_commit_sha: str | None = None
    merge_commit_parent_count: int | None = None


# Steps of the PR read that can fail and fall back to partial data. These are
# the names `PullRequestFetch.degraded` reports, in the JSON and in the report.
DEGRADED_BASIC = "basic"            # `gh pr list` for a state failed: its PRs are missing
DEGRADED_ENRICHMENT = "enrichment"  # GraphQL pass failed: commit refs and merge parents missing
DEGRADED_REVIEWS = "reviews"        # reviews pass failed: PRs carry no reviews
DEGRADED_FETCH = "fetch"            # the whole read raised: no PRs at all


@dataclass(frozen=True)
class PullRequestFetch:
    """Pull requests read from GitHub, and which read steps degraded on the way.

    ``degraded`` lists the steps that failed and fell back to partial data,
    sorted and without repeats. It is empty when every step succeeded, and
    also when PRs are absent *by design* (no ``gh`` on the machine, no GitHub
    remote): Iris works without PRs, and that is not a degradation.

    ``degraded_by_state`` maps each gh state read (``merged``, ``closed``,
    ``open``) to the steps that failed for it; ``degraded`` is their union.
    Empty when the read never got to the states — absent by design, or the
    whole read raised (``fetch``).
    """

    prs: list[PullRequest]
    degraded: tuple[str, ...] = ()
    degraded_by_state: dict[str, tuple[str, ...]] = field(default_factory=dict)
