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
    reviews: list[PRReview] = field(default_factory=list)
    commit_hashes: list[str] = field(default_factory=list)
