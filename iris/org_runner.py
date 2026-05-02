"""Organization runner — discover repos and orchestrate cross-repo analysis."""

import os
import sys
from datetime import datetime, timedelta, timezone

from iris.analysis.org_intelligence import (
    detect_org_attention_signals,
    generate_change_attribution,
    generate_delivery_narrative,
)
from iris.i18n import get_strings
from iris.ingestion.git_reader import read_commits
from iris.ingestion.github_reader import read_pull_requests
from iris.metrics.aggregator import aggregate
from iris.models.context import AnalysisContext
from iris.models.org import OrgResult, RepoResult
from iris.reports.narrative import generate_narrative
from iris.reports.org_writer import write_org_output
from iris.reports.writer import write_output


def discover_repos(
    org_path: str, filter_repos: list[str] | None = None,
) -> list[str]:
    """Scan org_path for directories containing .git.

    Args:
        org_path: Absolute path to the organization directory.
        filter_repos: Optional list of repo names to include.

    Returns:
        Sorted list of absolute paths to Git repositories.
    """
    repos = []
    for entry in sorted(os.listdir(org_path)):
        full_path = os.path.join(org_path, entry)
        if not os.path.isdir(full_path):
            continue
        if not os.path.isdir(os.path.join(full_path, ".git")):
            continue
        if filter_repos and entry not in filter_repos:
            continue
        repos.append(full_path)
    return repos


def analyze_single_repo(
    repo_path: str,
    days: int,
    churn_days: int,
    out_dir: str,
    lang: str = "en",
    trend_enabled: bool = False,
    recent_days: int = 30,
) -> tuple[RepoResult | None, str, str]:
    """Analyze a single repository and write its output.

    This is the shared logic between single-repo mode and org mode.

    Returns:
        (RepoResult or None, report_path, metrics_path).
        None when there are no commits.
    """
    repo_name = os.path.basename(repo_path)
    org_name = os.path.basename(os.path.dirname(repo_path))

    ctx = AnalysisContext(
        repo_path=repo_path,
        repo_name=repo_name,
        days=days,
        churn_days=churn_days,
        out_dir=out_dir,
        org_name=org_name,
        lang=lang,
    )

    # Step 1: Read commits
    commits = read_commits(repo_path, days=days)
    if not commits:
        return None, "", ""

    # Step 2: Fetch PRs (graceful fallback)
    try:
        prs = read_pull_requests(repo_path, days=days)
    except Exception:
        prs = []

    # Step 3+4: Aggregate metrics
    metrics = aggregate(commits, churn_days=churn_days, prs=prs or None)

    # Step 5: Trend analysis (optional)
    trend = None
    if trend_enabled:
        from iris.analysis.trend_delta import compute_trend_delta

        cutoff = datetime.now(timezone.utc) - timedelta(days=recent_days)
        recent_commits = [c for c in commits if c.date >= cutoff]
        recent_prs = [p for p in (prs or []) if p.created_at >= cutoff] or None

        recent_metrics = aggregate(
            recent_commits, churn_days=churn_days, prs=recent_prs,
        )
        trend = compute_trend_delta(
            baseline=metrics,
            recent=recent_metrics,
            baseline_days=days,
            recent_days=recent_days,
            lang=lang,
        )

    # Step 4b: Code durability (git blame)
    from iris.analysis.durability import calculate_durability
    from iris.analysis.origin_classifier import classify_origins as _classify_origins

    _origin_classified = _classify_origins(commits)
    _durability = calculate_durability(repo_path, commits, _origin_classified)
    if _durability:
        from iris.cli import _merge_durability
        metrics = _merge_durability(metrics, _durability)

    # Step 4c: Priming doc detection
    from iris.analysis.priming_detector import detect_priming

    priming = detect_priming(repo_path)

    # Step 5b: Adoption timeline detection
    adoption = None
    from iris.analysis.adoption_detector import detect_adoption
    from iris.analysis.trend_delta import compute_trend_delta
    from iris.models.adoption import AdoptionResult

    event, pre_commits, post_commits = detect_adoption(commits)
    if event and event.adoption_confidence != "insufficient" and pre_commits:
        pre_prs = [p for p in (prs or []) if p.created_at < event.adoption_ramp_start] or None
        post_prs = [p for p in (prs or []) if p.created_at >= event.adoption_ramp_start] or None

        pre_metrics = aggregate(pre_commits, churn_days=churn_days, prs=pre_prs)
        post_metrics = aggregate(post_commits, churn_days=churn_days, prs=post_prs)

        pre_days = max(1, (pre_commits[-1].date - pre_commits[0].date).days)
        post_days = max(1, (post_commits[-1].date - post_commits[0].date).days)

        comparison = compute_trend_delta(
            baseline=pre_metrics,
            recent=post_metrics,
            baseline_days=pre_days,
            recent_days=post_days,
            lang=lang,
        )
        adoption = AdoptionResult(
            event=event,
            pre_metrics=pre_metrics,
            post_metrics=post_metrics,
            comparison=comparison,
            pre_days=pre_days,
            post_days=post_days,
        )

    # Step 5c: Velocity analysis
    from iris.analysis.velocity import compute_velocity

    velocity = compute_velocity(commits, churn_days=churn_days)

    # Step 6: Generate narrative
    narrative = generate_narrative(metrics, lang=lang, trend=trend)

    # Step 7: Write output
    os.makedirs(out_dir, exist_ok=True)
    report_path, metrics_path = write_output(
        ctx, metrics, narrative_sections=narrative, trend=trend,
        adoption=adoption, velocity=velocity, priming=priming,
    )

    result = RepoResult(
        repo_name=repo_name,
        metrics=metrics,
        trend=trend,
        adoption=adoption,
        priming=priming,
    )
    return result, report_path, metrics_path


def run_org_analysis(
    org_path: str,
    days: int,
    churn_days: int,
    out_dir: str,
    lang: str = "en",
    trend_enabled: bool = False,
    recent_days: int = 30,
    filter_repos: list[str] | None = None,
) -> OrgResult:
    """Run organization-level analysis across all repos.

    1. Discover repos
    2. Analyze each repo sequentially
    3. Generate cross-repo intelligence
    4. Write org report

    Returns the OrgResult.
    """
    s = get_strings(lang)
    org_name = os.path.basename(os.path.normpath(org_path))

    # Discover repos
    print(s["cli_org_discovering"], end=" ", flush=True)
    repo_paths = discover_repos(org_path, filter_repos=filter_repos)
    print(s["cli_org_repos_found"].format(count=len(repo_paths)))

    if not repo_paths:
        print(s["cli_org_no_repos"])
        sys.exit(0)

    # Analyze each repo sequentially
    repo_results: list[RepoResult] = []
    total = len(repo_paths)

    for i, repo_path in enumerate(repo_paths, 1):
        repo_name = os.path.basename(repo_path)
        print(s["cli_org_analyzing_repo"].format(
            repo=repo_name, current=i, total=total,
        ), end=" ", flush=True)

        result, _, _ = analyze_single_repo(
            repo_path=repo_path,
            days=days,
            churn_days=churn_days,
            out_dir=out_dir,
            lang=lang,
            trend_enabled=trend_enabled,
            recent_days=recent_days,
        )

        if result:
            repo_results.append(result)
            print(s["cli_org_repo_done"].format(
                repo=repo_name,
                commits=result.metrics.commits_total,
                stab=f"{result.metrics.stabilization_ratio:.0%}",
            ))
        else:
            print(s["cli_org_repo_skipped"].format(repo=repo_name))

    # Generate cross-repo intelligence
    print(s["cli_org_generating"], end=" ", flush=True)

    change_attribution = ""
    attention_signals = []
    delivery_narrative = ""

    if trend_enabled:
        change_attribution = generate_change_attribution(
            repo_results, lang=lang,
        )
        attention_signals = detect_org_attention_signals(
            repo_results, lang=lang,
        )
        delivery_narrative = generate_delivery_narrative(
            repo_results, lang=lang,
        )

    org_result = OrgResult(
        org_name=org_name,
        repos=repo_results,
        change_attribution=change_attribution,
        attention_signals=attention_signals,
        delivery_narrative=delivery_narrative,
    )

    # Write org report
    report_path, metrics_path = write_org_output(
        org_result,
        out_dir=out_dir,
        days=days,
        recent_days=recent_days,
        lang=lang,
        has_trend=trend_enabled,
    )
    print(s["cli_org_done"])

    print()
    print(f"{s['cli_org_label_report']:<14}: {report_path}")
    print(f"{s['cli_org_label_metrics']:<14}: {metrics_path}")

    return org_result
