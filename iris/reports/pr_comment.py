"""PR comment formatter — turns PRInsightsResult into concise markdown.

Output is designed for posting as a GitHub PR comment:
- Header with PR number
- Summary line (commits, AI count, tools, intent, size)
- 2-5 insight bullets
- Footer disclaimer

Rules:
- No individual developer names
- Constructive tone
- Concise: fit in a PR comment without overwhelming
"""

from iris.analysis.pr_insights import PRInsightsResult


def format_pr_comment(result: PRInsightsResult) -> str:
    """Format PR insights as a concise markdown comment.

    Args:
        result: PRInsightsResult from analyze_pr().

    Returns:
        Markdown string suitable for gh pr comment --body.
    """
    lines: list[str] = []

    # Header
    lines.append(f"### Iris — PR #{result.pr_number}")
    lines.append("")

    # Summary line
    summary_parts: list[str] = []

    # Commit composition
    commit_str = f"**{result.commit_count} commit{'s' if result.commit_count != 1 else ''}**"
    if result.ai_commit_count > 0 and result.tools_detected:
        tool_str = ", ".join(result.tools_detected)
        commit_str += f" ({result.ai_commit_count} AI-assisted via {tool_str})"
    summary_parts.append(commit_str)

    # Intent breakdown
    if result.intent_summary:
        intent_parts = []
        for intent in ["FEATURE", "FIX", "REFACTOR", "CONFIG"]:
            count = result.intent_summary.get(intent, 0)
            if count > 0:
                label = intent.lower()
                if count > 1:
                    label += "es" if intent == "FIX" else "s"
                intent_parts.append(f"{count} {label}")
        if intent_parts:
            summary_parts.append(" | ".join(intent_parts))

    # Size
    size_str = f"+{result.size_additions} / -{result.size_deletions} across {result.size_files} file{'s' if result.size_files != 1 else ''}"
    summary_parts.append(size_str)

    lines.append(" | ".join(summary_parts))
    lines.append("")

    # Insight bullets — prioritize watch/attention, then fill with info
    if result.insights:
        priority_order = {"attention": 0, "watch": 1, "info": 2}
        sorted_insights = sorted(
            result.insights,
            key=lambda i: priority_order.get(i.severity, 3),
        )

        # Show up to 5 insights
        for insight in sorted_insights[:5]:
            lines.append(f"- {insight.message}")
        lines.append("")

    # Footer
    lines.append("> *Iris — metrics are hypotheses, not verdicts.*")

    return "\n".join(lines)
