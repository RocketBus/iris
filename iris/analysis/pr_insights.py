"""PR-level insights — analyze a single pull request for contextual signals.

Generates concise, actionable insights about a PR by combining:
- Commit composition (AI vs human, tool detection, intent)
- PR metadata (size, review rounds)
- Repository context (churn overlap, cascade risk on touched files)

Principles:
- Analyze code, never rank individuals
- Metrics are hypotheses, not verdicts
- Constructive tone: "consider X" never "you did Y wrong"
"""

# AGGREGATOR_OPT_OUT: scoped to a single PR, not the full repo history.
# Consumers: iris/cli.py (cmd_pr), iris/reports/pr_comment.py

from collections import defaultdict
from dataclasses import dataclass, field
from os.path import dirname

from iris.analysis.churn_calculator import calculate_churn
from iris.analysis.cascade_detector import detect_cascades
from iris.analysis.intent_classifier import classify_commits
from iris.analysis.origin_classifier import (
    CommitOrigin,
    build_tool_map,
    classify_origins,
)
from iris.models.commit import Commit
from iris.models.pull_request import PullRequest


@dataclass(frozen=True)
class PRInsight:
    """A single insight about a pull request."""

    category: str   # composition, churn_risk, cascade_risk, review, size, concentration
    message: str    # Human-readable markdown sentence
    severity: str   # info, watch, attention


@dataclass(frozen=True)
class PRInsightsResult:
    """Complete PR analysis result."""

    pr_number: int
    pr_title: str
    commit_count: int
    ai_commit_count: int
    tools_detected: list[str]
    intent_summary: dict[str, int]
    size_additions: int
    size_deletions: int
    size_files: int
    review_rounds: int
    insights: list[PRInsight]


# Thresholds (hypotheses — should evolve with observation)
LARGE_PR_LINES = 500
LARGE_PR_FILES = 20
HIGH_REVIEW_ROUNDS = 2


def analyze_pr(
    pr: PullRequest,
    pr_commits: list[Commit],
    context_commits: list[Commit] | None = None,
    churn_days: int = 14,
) -> PRInsightsResult:
    """Analyze a single pull request and generate insights.

    Args:
        pr: The pull request metadata from GitHub.
        pr_commits: Commits belonging to this PR (from git history).
        context_commits: Optional recent repo commits for churn/cascade context.
        churn_days: Window for churn/cascade analysis (default: 14).

    Returns:
        PRInsightsResult with composition data and insight bullets.
    """
    insights: list[PRInsight] = []

    # --- Composition ---
    classified = classify_origins(pr_commits)
    tool_map = build_tool_map(classified)

    ai_count = sum(1 for _, origin in classified if origin == CommitOrigin.AI_ASSISTED)
    tools = sorted(set(tool_map.values()))

    # --- Intent ---
    intent_classified = classify_commits(pr_commits)
    intent_counts: dict[str, int] = defaultdict(int)
    for cc in intent_classified:
        intent_counts[cc.intent.value] += 1

    # --- PR files ---
    pr_files: set[str] = set()
    for commit in pr_commits:
        for fc in commit.files:
            pr_files.add(fc.path)

    # --- Insight: AI composition ---
    if ai_count > 0 and tools:
        tool_str = ", ".join(tools)
        insights.append(PRInsight(
            category="composition",
            message=f"{ai_count} of {len(pr_commits)} commits are AI-assisted ({tool_str})",
            severity="info",
        ))

    # --- Insight: Size ---
    total_lines = pr.additions + pr.deletions
    if total_lines > LARGE_PR_LINES or pr.changed_files > LARGE_PR_FILES:
        insights.append(PRInsight(
            category="size",
            message=f"Large PR: +{pr.additions}/-{pr.deletions} across {pr.changed_files} files — consider splitting for easier review",
            severity="attention",
        ))

    # --- Insight: Review rounds ---
    review_rounds = sum(1 for r in pr.reviews if r.state == "CHANGES_REQUESTED")
    if review_rounds > HIGH_REVIEW_ROUNDS:
        insights.append(PRInsight(
            category="review",
            message=f"{review_rounds} rounds of changes requested — patterns here may inform future PRs",
            severity="watch",
        ))

    # --- Insight: Directory concentration ---
    if pr_files:
        dir_counts: dict[str, int] = defaultdict(int)
        for path in pr_files:
            top_dir = path.split("/")[0] if "/" in path else "."
            dir_counts[top_dir] += 1
        top_dir_name = max(dir_counts, key=dir_counts.get)
        top_dir_pct = dir_counts[top_dir_name] / len(pr_files)
        if top_dir_pct > 0.8 and len(pr_files) > 3:
            insights.append(PRInsight(
                category="concentration",
                message=f"{top_dir_pct:.0%} of changes concentrated in `{top_dir_name}/`",
                severity="info",
            ))

    # --- Context-dependent insights ---
    if context_commits:
        # Churn context
        churn_result = calculate_churn(context_commits, churn_days)
        churning_overlap = pr_files & set(churn_result.churning_files)
        if churning_overlap:
            insights.append(PRInsight(
                category="churn_risk",
                message=f"{len(churning_overlap)} file(s) in this PR have been churning in the last {churn_days} days — consider focused review",
                severity="watch",
            ))

        # Cascade risk
        context_classified = classify_origins(context_commits)
        cascade_result = detect_cascades(context_commits, context_classified)
        if cascade_result and cascade_result.cascades:
            cascade_files: set[str] = set()
            for cascade in cascade_result.cascades:
                cascade_files.update(cascade.files_requiring_fix)
            cascade_overlap = pr_files & cascade_files
            if cascade_overlap:
                insights.append(PRInsight(
                    category="cascade_risk",
                    message=f"{len(cascade_overlap)} file(s) were recently part of correction cascades — extra attention recommended",
                    severity="attention",
                ))

    return PRInsightsResult(
        pr_number=pr.number,
        pr_title=pr.title,
        commit_count=len(pr_commits),
        ai_commit_count=ai_count,
        tools_detected=tools,
        intent_summary=dict(intent_counts),
        size_additions=pr.additions,
        size_deletions=pr.deletions,
        size_files=pr.changed_files,
        review_rounds=review_rounds,
        insights=insights,
    )
