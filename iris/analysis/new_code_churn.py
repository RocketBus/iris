"""New code churn rate — how quickly newly added code needs revision.

Measures the percentage of files receiving new code that are subsequently
modified within 2-week and 4-week windows. This is a file-level
approximation of GitClear's line-level new-code churn metric.

GitClear's 2025 research found a 20-25% increase in the rate of new
lines that get revised within a month, comparing 2024 to the pre-AI
2021 baseline.

Key metrics:
- new_code_churn_rate_2w: % of new-code files re-modified within 14 days
- new_code_churn_rate_4w: % of new-code files re-modified within 28 days
- Both segmented by origin (HUMAN, AI_ASSISTED)

Attribution: origin goes to the **introducing** commit, answering
"does AI-authored code need more rework?"
"""

# AGGREGATOR_OPT_OUT: runs alongside the post-hoc diff-analysis chain (dup / move / operations).
# Keeps the slow diff-driven analyses grouped and skippable together.
# Consumers: iris/cli.py (Step 4f)

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import timedelta

from iris.analysis.origin_classifier import CommitOrigin
from iris.models.commit import Commit


@dataclass(frozen=True)
class NewCodeChurnByOrigin:
    """New code churn for a single origin."""

    origin: str
    files_with_new_code: int
    files_churned_2w: int
    files_churned_4w: int
    churn_rate_2w: float
    churn_rate_4w: float


@dataclass(frozen=True)
class NewCodeChurnByTool:
    """New code churn for a specific AI tool."""

    tool: str
    files_with_new_code: int
    files_churned_2w: int
    files_churned_4w: int
    churn_rate_2w: float
    churn_rate_4w: float


@dataclass(frozen=True)
class NewCodeChurnResult:
    """Complete new code churn analysis."""

    total_files_with_new_code: int
    total_files_churned_2w: int
    total_files_churned_4w: int
    new_code_churn_rate_2w: float
    new_code_churn_rate_4w: float
    by_origin: list[NewCodeChurnByOrigin]
    by_tool: list[NewCodeChurnByTool] = field(default_factory=list)


# Minimum thresholds.
MIN_FILES_FOR_ANALYSIS = 10
MIN_FILES_PER_ORIGIN = 5

# Churn windows.
WINDOW_2W = timedelta(days=14)
WINDOW_4W = timedelta(days=28)


def calculate_new_code_churn(
    commits: list[Commit],
    origin_classified: list[tuple[Commit, CommitOrigin]],
    tool_map: dict[str, str] | None = None,
) -> NewCodeChurnResult | None:
    """Calculate how quickly newly added code needs revision.

    For each file that receives additions in a commit at time T,
    checks if it is modified again by a subsequent commit within
    2 or 4 weeks.

    Args:
        commits: Commits sorted by date (analysis window).
        origin_classified: Pre-classified (commit, origin) pairs.
        tool_map: Optional commit hash -> tool name mapping from build_tool_map().

    Returns:
        NewCodeChurnResult with churn rates, or None if insufficient data.
    """
    origin_map = {c.hash: origin.value for c, origin in origin_classified}

    # Build per-file touch history: {path: [(date, origin, lines_added, hash), ...]}
    file_touches: dict[str, list[tuple]] = defaultdict(list)

    sorted_commits = sorted(commits, key=lambda c: c.date)
    for commit in sorted_commits:
        if commit.is_merge:
            continue
        origin = origin_map.get(commit.hash, CommitOrigin.HUMAN.value)
        for fc in commit.files:
            file_touches[fc.path].append((commit.date, origin, fc.lines_added, commit.hash))

    # Track new-code events and whether they get churned
    # A "new code event" = a file touch with lines_added > 0
    origin_new_files: dict[str, int] = defaultdict(int)
    origin_churned_2w: dict[str, int] = defaultdict(int)
    origin_churned_4w: dict[str, int] = defaultdict(int)
    tool_new_files: dict[str, int] = defaultdict(int)
    tool_churned_2w: dict[str, int] = defaultdict(int)
    tool_churned_4w: dict[str, int] = defaultdict(int)
    total_new = 0
    total_2w = 0
    total_4w = 0

    for path, touches in file_touches.items():
        for i, (date, origin, lines_added, commit_hash) in enumerate(touches):
            if lines_added == 0:
                continue

            total_new += 1
            origin_new_files[origin] += 1
            tool = tool_map.get(commit_hash) if tool_map else None
            if tool:
                tool_new_files[tool] += 1

            # Look ahead for subsequent modifications
            churned_2w = False
            churned_4w = False
            for j in range(i + 1, len(touches)):
                next_date = touches[j][0]
                delta = next_date - date
                if delta <= WINDOW_2W:
                    churned_2w = True
                    churned_4w = True
                    break
                elif delta <= WINDOW_4W:
                    churned_4w = True
                    break
                else:
                    break  # sorted by date, no need to look further

            if churned_2w:
                total_2w += 1
                origin_churned_2w[origin] += 1
                if tool:
                    tool_churned_2w[tool] += 1
            if churned_4w:
                total_4w += 1
                origin_churned_4w[origin] += 1
                if tool:
                    tool_churned_4w[tool] += 1

    if total_new < MIN_FILES_FOR_ANALYSIS:
        return None

    # Build per-origin breakdown
    by_origin: list[NewCodeChurnByOrigin] = []
    for origin in [CommitOrigin.HUMAN.value, CommitOrigin.AI_ASSISTED.value]:
        new_count = origin_new_files.get(origin, 0)
        if new_count < MIN_FILES_PER_ORIGIN:
            continue

        c2w = origin_churned_2w.get(origin, 0)
        c4w = origin_churned_4w.get(origin, 0)

        by_origin.append(NewCodeChurnByOrigin(
            origin=origin,
            files_with_new_code=new_count,
            files_churned_2w=c2w,
            files_churned_4w=c4w,
            churn_rate_2w=round(c2w / new_count, 3),
            churn_rate_4w=round(c4w / new_count, 3),
        ))

    # Build per-tool breakdown
    by_tool: list[NewCodeChurnByTool] = []
    if tool_map:
        for tool in sorted(tool_new_files.keys()):
            new_count = tool_new_files[tool]
            if new_count < MIN_FILES_PER_ORIGIN:
                continue

            c2w = tool_churned_2w.get(tool, 0)
            c4w = tool_churned_4w.get(tool, 0)

            by_tool.append(NewCodeChurnByTool(
                tool=tool,
                files_with_new_code=new_count,
                files_churned_2w=c2w,
                files_churned_4w=c4w,
                churn_rate_2w=round(c2w / new_count, 3),
                churn_rate_4w=round(c4w / new_count, 3),
            ))

    return NewCodeChurnResult(
        total_files_with_new_code=total_new,
        total_files_churned_2w=total_2w,
        total_files_churned_4w=total_4w,
        new_code_churn_rate_2w=round(total_2w / total_new, 3),
        new_code_churn_rate_4w=round(total_4w / total_new, 3),
        by_origin=by_origin,
        by_tool=by_tool,
    )
