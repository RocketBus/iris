"""Pull request data model for GitHub PR lifecycle analysis."""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class PRReview:
    """A single review event on a pull request."""

    author: str
    state: str  # APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED
    submitted_at: datetime


@dataclass(frozen=True)
class PullRequest:
    """A merged pull request with metadata and review history."""

    number: int
    title: str
    author: str
    created_at: datetime
    merged_at: datetime
    additions: int
    deletions: int
    changed_files: int
    reviews: list[PRReview] = field(default_factory=list)
    commit_hashes: list[str] = field(default_factory=list)
