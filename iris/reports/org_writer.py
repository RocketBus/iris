"""Organization report writer — generates org-report.md and org-metrics.json."""

import json
import os
from statistics import median

from iris.analysis.trend_delta import _get_delta, generate_attention_summary
from iris.i18n import get_strings
from iris.models.org import OrgResult


def _format_delta(delta) -> str:
    """Format a MetricDelta as a compact string for the repo overview table."""
    if delta is None:
        return ""
    sign = "+" if delta.delta >= 0 else ""
    return f"{sign}{delta.delta:.0f}pp"


def _attention_label(repo_result, lang: str = "en") -> str:
    """Generate a short localized attention label for the repo overview table."""
    s = get_strings(lang)
    if not repo_result.trend or not repo_result.trend.has_sufficient_data:
        return ""
    summary = generate_attention_summary(repo_result.trend, lang=lang)
    if not summary:
        return s["org_attention_none"]
    # Match against known attention patterns and return localized label
    for key in ["destabilizing", "stabilizing", "workflow_friction",
                "composition_shift", "stable", "mixed"]:
        full_key = f"attention_{key}"
        if full_key in s and summary.startswith(
            s[full_key].split("{")[0].strip()
        ):
            label_key = f"org_attention_{key}"
            return s.get(label_key, key.replace("_", " "))
    return s.get("org_attention_mixed", "mixed")


def write_org_report(
    org_result: OrgResult,
    out_dir: str,
    days: int,
    recent_days: int,
    lang: str = "en",
    has_trend: bool = False,
) -> str:
    """Write the organization report markdown file.

    Returns the file path.
    """
    s = get_strings(lang)

    lines = [
        f"# {s['org_report_title']}",
        "",
        f"**{s['org_label_organization']}:** {org_result.org_name}",
        f"**{s['org_label_repos_analyzed']}:** {len(org_result.repos)}",
        f"**{s['label_analysis_window']}:** {days} {s['unit_days']}",
    ]
    if has_trend:
        lines.append(
            f"**{s['org_label_recent_window']}:** {recent_days} {s['unit_days']}"
        )
    lines.extend([
        "",
        f"> *{s['system_disclaimer']}*",
        "",
        "---",
        "",
    ])

    # Conditional intelligence sections (only with --trend and sufficient data)
    if has_trend and org_result.change_attribution:
        lines.extend([
            f"## {s['org_section_what_changed']}",
            "",
            org_result.change_attribution,
            "",
        ])

    if has_trend and org_result.attention_signals:
        lines.extend([
            f"## {s['org_section_where_to_look']}",
            "",
        ])
        for signal in org_result.attention_signals:
            lines.append(f"**{signal.repository}** — {signal.summary}")
            if signal.details:
                for detail in signal.details:
                    lines.append(f"  - {detail}")
            lines.append("")

    if has_trend and org_result.delivery_narrative:
        lines.extend([
            f"## {s['org_section_delivery_trajectory']}",
            "",
            org_result.delivery_narrative,
            "",
        ])

    if has_trend and (org_result.change_attribution
                      or org_result.attention_signals
                      or org_result.delivery_narrative):
        lines.extend(["---", ""])

    # AI Impact Across Organization (conditional — only when AI commits exist)
    ai_repos = [
        r for r in org_result.repos
        if r.metrics.stabilization_by_origin is not None
    ]
    if ai_repos:
        human_stabs = [
            r.metrics.stabilization_by_origin["HUMAN"]["stabilization_ratio"]
            for r in ai_repos
            if r.metrics.stabilization_by_origin
            and r.metrics.stabilization_by_origin.get("HUMAN", {}).get("files_touched", 0) > 0
        ]
        ai_stabs = [
            r.metrics.stabilization_by_origin["AI_ASSISTED"]["stabilization_ratio"]
            for r in ai_repos
            if r.metrics.stabilization_by_origin
            and r.metrics.stabilization_by_origin.get("AI_ASSISTED", {}).get("files_touched", 0) > 0
        ]
        human_median = f"{median(human_stabs):.0%}" if human_stabs else "N/A"
        ai_median = f"{median(ai_stabs):.0%}" if ai_stabs else "N/A"

        lines.extend([
            f"## {s['org_ai_impact_title']}",
            "",
            s["org_ai_impact_body"].format(
                total_repos=len(org_result.repos),
                ai_repos=len(ai_repos),
                human_stab=human_median,
                ai_stab=ai_median,
            ),
            "",
        ])

        # Detection coverage breakdown
        high_cov = sum(
            1 for r in org_result.repos
            if r.metrics.ai_detection_coverage_pct is not None
            and r.metrics.ai_detection_coverage_pct >= 30
        )
        low_cov = sum(
            1 for r in org_result.repos
            if r.metrics.ai_detection_coverage_pct is not None
            and 0 < r.metrics.ai_detection_coverage_pct < 30
        )
        no_ai = sum(
            1 for r in org_result.repos
            if r.metrics.ai_detection_coverage_pct is None
            or r.metrics.ai_detection_coverage_pct == 0
        )
        lines.append(
            f"{s['org_ai_coverage_breakdown'].format(high=high_cov, low=low_cov, none=no_ai)}"
        )
        lines.append("")

        # Fix latency by origin (org-wide aggregation)
        human_latencies = []
        ai_latencies = []
        for r in org_result.repos:
            flo = r.metrics.fix_latency_by_origin
            if not flo:
                continue
            h = flo.get("HUMAN")
            a = flo.get("AI_ASSISTED")
            if h:
                human_latencies.append(h["median_latency_hours"])
            if a:
                ai_latencies.append(a["median_latency_hours"])

        if human_latencies or ai_latencies:
            lines.append(f"**{s['org_ai_fix_latency_title']}**")
            lines.append("")
            if human_latencies:
                med_h = median(human_latencies)
                lines.append(f"- Human: {med_h / 24:.1f} days median rework ({len(human_latencies)} repos)")
            if ai_latencies:
                med_a = median(ai_latencies)
                lines.append(f"- AI-Assisted: {med_a / 24:.1f} days median rework ({len(ai_latencies)} repos)")
            lines.append("")

        # Adoption timeline summary
        repos_with_adoption = [
            r for r in org_result.repos
            if r.adoption is not None and r.adoption.event.adoption_confidence != "insufficient"
        ]
        if repos_with_adoption:
            clear = [r for r in repos_with_adoption if r.adoption.event.adoption_confidence == "clear"]
            sparse = [r for r in repos_with_adoption if r.adoption.event.adoption_confidence == "sparse"]
            lines.append(f"**{s['org_ai_adoption_title']}**")
            lines.append("")
            lines.append(
                s["org_ai_adoption_body"].format(
                    clear=len(clear), sparse=len(sparse), total=len(org_result.repos),
                )
            )
            lines.append("")

    # Organization Metrics Summary
    total_commits = sum(r.metrics.commits_total for r in org_result.repos)
    total_prs = sum(
        r.metrics.pr_merged_count or 0 for r in org_result.repos
    )
    stab_values = [r.metrics.stabilization_ratio for r in org_result.repos]
    median_stab = median(stab_values) if stab_values else 0.0
    revert_values = [r.metrics.revert_rate for r in org_result.repos]
    median_revert = median(revert_values) if revert_values else 0.0

    lines.extend([
        f"## {s['org_section_metrics_summary']}",
        "",
        f"| {s['table_metric']} | {s['table_value']} |",
        "|---|---|",
        f"| {s['org_metric_total_commits']} | {total_commits} |",
        f"| {s['org_metric_total_prs_merged']} | {total_prs} |",
        f"| {s['org_metric_repos_analyzed']} | {len(org_result.repos)} |",
        f"| {s['org_metric_median_stabilization']} | {median_stab:.1%} |",
        f"| {s['org_metric_median_revert_rate']} | {median_revert:.1%} |",
        "",
    ])

    # Repository Overview table
    lines.extend([
        f"## {s['org_section_repo_overview']}",
        "",
    ])

    if has_trend:
        lines.extend([
            f"| {s['org_table_repository']} | {s['org_table_commits']} "
            f"| {s['org_table_stabilization']} | \u0394 {s['org_table_delta_stabilization']} "
            f"| {s['org_table_prs']} | {s['org_table_attention']} |",
            "|---|---|---|---|---|---|",
        ])
        for r in sorted(org_result.repos, key=lambda x: x.repo_name):
            stab = f"{r.metrics.stabilization_ratio:.0%}"
            delta_stab = ""
            attention = ""
            if r.trend and r.trend.has_sufficient_data:
                d = _get_delta(r.trend, "stabilization_ratio")
                delta_stab = _format_delta(d)
                attention = _attention_label(r, lang=lang)
            prs = r.metrics.pr_merged_count or 0
            lines.append(
                f"| {r.repo_name} | {r.metrics.commits_total} "
                f"| {stab} | {delta_stab} | {prs} | {attention} |"
            )
    else:
        lines.extend([
            f"| {s['org_table_repository']} | {s['org_table_commits']} "
            f"| {s['org_table_stabilization']} | {s['org_table_prs']} |",
            "|---|---|---|---|",
        ])
        for r in sorted(org_result.repos, key=lambda x: x.repo_name):
            stab = f"{r.metrics.stabilization_ratio:.0%}"
            prs = r.metrics.pr_merged_count or 0
            lines.append(
                f"| {r.repo_name} | {r.metrics.commits_total} "
                f"| {stab} | {prs} |"
            )

    lines.extend([
        "",
        "---",
        "",
        f"*{s['disclaimer']}*",
        "",
    ])

    path = os.path.join(out_dir, f"{org_result.org_name}-org-report.md")
    with open(path, "w") as f:
        f.write("\n".join(lines))
    return path


def write_org_metrics(
    org_result: OrgResult,
    out_dir: str,
    days: int,
    lang: str = "en",
) -> str:
    """Write the organization metrics JSON file.

    Returns the file path.
    """
    stab_values = [r.metrics.stabilization_ratio for r in org_result.repos]
    total_commits = sum(r.metrics.commits_total for r in org_result.repos)
    total_prs = sum(
        r.metrics.pr_merged_count or 0 for r in org_result.repos
    )

    repo_entries = []
    for r in sorted(org_result.repos, key=lambda x: x.repo_name):
        entry = {
            "name": r.repo_name,
            "commits_total": r.metrics.commits_total,
            "stabilization_ratio": round(r.metrics.stabilization_ratio, 3),
        }
        if r.trend and r.trend.has_sufficient_data:
            entry["attention_signal"] = _attention_label(r, lang=lang)
        repo_entries.append(entry)

    data = {
        "org_name": org_result.org_name,
        "repos_analyzed": len(org_result.repos),
        "analysis_window_days": days,
        "total_commits": total_commits,
        "total_prs_merged": total_prs,
        "median_stabilization_ratio": round(
            median(stab_values) if stab_values else 0.0, 3,
        ),
        "repos": repo_entries,
    }

    path = os.path.join(out_dir, f"{org_result.org_name}-org-metrics.json")
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    return path


def write_org_output(
    org_result: OrgResult,
    out_dir: str,
    days: int,
    recent_days: int,
    lang: str = "en",
    has_trend: bool = False,
) -> tuple[str, str]:
    """Write both org output files. Creates out_dir if needed.

    Returns (report_path, metrics_path).
    """
    os.makedirs(out_dir, exist_ok=True)
    report_path = write_org_report(
        org_result, out_dir, days, recent_days, lang=lang, has_trend=has_trend,
    )
    metrics_path = write_org_metrics(
        org_result, out_dir, days, lang=lang,
    )
    return report_path, metrics_path
