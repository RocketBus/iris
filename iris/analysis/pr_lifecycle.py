"""PR lifecycle analysis — computes delivery metrics from pull request data.

Metrics produced:
- pr_merged_count: Total PRs merged in the window
- pr_median_time_to_merge_hours: Median hours from open to merge
- pr_median_size_files: Median changed files per PR
- pr_median_size_lines: Median total lines (additions + deletions) per PR
- pr_review_rounds_median: Median CHANGES_REQUESTED count per PR
- pr_single_pass_rate: Fraction of PRs merged without any CHANGES_REQUESTED

These metrics help measure how AI tooling affects the PR review cycle.
Thresholds are NOT defined here — this module only computes values.
"""

from dataclasses import dataclass
from statistics import median

from iris.models.pull_request import PullRequest


@dataclass(frozen=True)
class PRLifecycleResult:
    """Results from PR lifecycle analysis."""

    pr_merged_count: int
    pr_median_time_to_merge_hours: float
    pr_median_size_files: int
    pr_median_size_lines: int
    pr_review_rounds_median: float
    pr_single_pass_rate: float


def analyze_pr_lifecycle(prs: list[PullRequest]) -> PRLifecycleResult:
    """Compute PR lifecycle metrics from a list of merged pull requests.

    Args:
        prs: Merged PRs from github_reader (must not be empty).

    Returns:
        PRLifecycleResult with all 6 metrics populated.
    """
    count = len(prs)

    # Time to merge: hours between created_at and merged_at
    times_to_merge = [
        (pr.merged_at - pr.created_at).total_seconds() / 3600
        for pr in prs
    ]

    # PR size: changed files and total lines (additions + deletions)
    sizes_files = [pr.changed_files for pr in prs]
    sizes_lines = [pr.additions + pr.deletions for pr in prs]

    # Review rounds: count of CHANGES_REQUESTED per PR
    review_rounds = [
        sum(1 for r in pr.reviews if r.state == "CHANGES_REQUESTED")
        for pr in prs
    ]

    # Single pass: PRs with zero CHANGES_REQUESTED
    single_pass_count = sum(1 for rounds in review_rounds if rounds == 0)

    return PRLifecycleResult(
        pr_merged_count=count,
        pr_median_time_to_merge_hours=round(median(times_to_merge), 1),
        pr_median_size_files=int(median(sizes_files)),
        pr_median_size_lines=int(median(sizes_lines)),
        pr_review_rounds_median=round(median(review_rounds), 1),
        pr_single_pass_rate=round(single_pass_count / count, 2) if count > 0 else 0.0,
    )
