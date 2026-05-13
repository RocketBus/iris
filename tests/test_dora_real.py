"""Tests for the Datadog-derived DORA analysis module.

Runnable as: `python -m pytest tests/test_dora_real.py -v`
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.dora_real import analyze_dora_real
from iris.models.external import (
    ExternalDeployment,
    ExternalDeploymentCommit,
    ExternalDORAData,
    ExternalIncident,
)


_BASE = datetime(2026, 4, 1, 0, 0, tzinfo=timezone.utc)


def _deploy(
    *,
    event_id: str = "d-1",
    change_failure: bool | None = False,
    recovery_time_sec: int | None = None,
    remediation_type: str | None = None,
    lead_times: list[int] | None = None,
    started_offset_hours: float = 0.0,
) -> ExternalDeployment:
    commits = [
        ExternalDeploymentCommit(commit_sha=f"sha-{i}", change_lead_time=lt)
        for i, lt in enumerate(lead_times or [])
    ]
    return ExternalDeployment(
        provider_event_id=event_id,
        started_at=_BASE + timedelta(hours=started_offset_hours),
        change_failure=change_failure,
        recovery_time_sec=recovery_time_sec,
        remediation_type=remediation_type,
        commits=commits,
    )


def _incident(
    *,
    event_id: str = "i-1",
    time_to_restore_seconds: int | None = None,
    started_offset_hours: float = 0.0,
) -> ExternalIncident:
    return ExternalIncident(
        provider_event_id=event_id,
        started_at=_BASE + timedelta(hours=started_offset_hours),
        time_to_restore_seconds=time_to_restore_seconds,
    )


def test_empty_input_defaults():
    """No data → result is structured but everything sits at zero / None."""
    result = analyze_dora_real(ExternalDORAData())
    assert result.deployments_total == 0
    assert result.cfr is None
    assert result.rollback_rate is None
    assert result.mttr_per_deploy_seconds_median is None
    assert result.lead_time_seconds_median is None
    assert result.deploy_frequency_per_day is None


def test_cfr_excludes_pending_from_denominator():
    """Tri-state: null change_failure must NOT count toward the denominator."""
    data = ExternalDORAData(
        deployments=[
            _deploy(event_id=f"d-{i}", change_failure=False) for i in range(8)
        ] + [
            _deploy(event_id="d-f1", change_failure=True, recovery_time_sec=600),
            _deploy(event_id="d-f2", change_failure=True, recovery_time_sec=1200),
            _deploy(event_id="d-p1", change_failure=None),
            _deploy(event_id="d-p2", change_failure=None),
        ]
    )

    result = analyze_dora_real(data)

    assert result.deployments_total == 12
    assert result.deployments_failed == 2
    assert result.deployments_pending_evaluation == 2
    # 2 failed / 10 evaluated (8 + 2)
    assert result.cfr == 0.2


def test_cfr_none_when_everything_pending():
    """All deploys pending evaluation → CFR is undefined, not 0."""
    data = ExternalDORAData(
        deployments=[
            _deploy(event_id=f"d-{i}", change_failure=None) for i in range(5)
        ]
    )
    result = analyze_dora_real(data)
    assert result.deployments_pending_evaluation == 5
    assert result.cfr is None


def test_mttr_per_deploy_uses_recovery_time_sec_on_failed_only():
    """Recovery time is meaningful only when change_failure is True."""
    data = ExternalDORAData(
        deployments=[
            _deploy(event_id="ok-1", change_failure=False, recovery_time_sec=999_999),
            _deploy(event_id="f-1", change_failure=True, recovery_time_sec=300),
            _deploy(event_id="f-2", change_failure=True, recovery_time_sec=900),
            _deploy(event_id="f-3", change_failure=True, recovery_time_sec=600),
        ]
    )
    result = analyze_dora_real(data)
    assert result.mttr_per_deploy_seconds_median == 600.0


def test_mttr_per_incident_independent_of_deploys():
    """Incident-level MTTR is the canonical DORA number; comes from failures table."""
    data = ExternalDORAData(
        incidents=[
            _incident(event_id="i-1", time_to_restore_seconds=520_167),
            _incident(event_id="i-2", time_to_restore_seconds=120_000),
        ]
    )
    result = analyze_dora_real(data)
    assert result.incidents_total == 2
    assert result.mttr_per_incident_seconds_median == 320_083.5 or result.mttr_per_incident_seconds_median == 320083.5


def test_rollback_rate_is_share_of_failed_deploys():
    """rollback_rate = rollbacks / failed; null when no failures."""
    data = ExternalDORAData(
        deployments=[
            _deploy(event_id="f-1", change_failure=True, remediation_type="rollback"),
            _deploy(event_id="f-2", change_failure=True, remediation_type="rollback"),
            _deploy(event_id="f-3", change_failure=True, remediation_type="hotfix"),
            _deploy(event_id="f-4", change_failure=True, remediation_type=None),
        ]
    )
    result = analyze_dora_real(data)
    assert result.deployments_failed == 4
    assert result.rollbacks_total == 2
    assert result.rollback_rate == 0.5
    assert result.remediation_distribution == {
        "rollback": 2,
        "hotfix": 1,
        "unknown": 1,
    }


def test_rollback_rate_none_when_no_failures():
    data = ExternalDORAData(
        deployments=[_deploy(event_id="ok-1", change_failure=False)]
    )
    result = analyze_dora_real(data)
    assert result.deployments_failed == 0
    assert result.rollback_rate is None


def test_lead_time_median_across_all_commits():
    """Lead time is per-commit, aggregated across deploys."""
    data = ExternalDORAData(
        deployments=[
            _deploy(event_id="d-1", lead_times=[3600, 7200]),
            _deploy(event_id="d-2", lead_times=[1800]),
            _deploy(event_id="d-3", lead_times=[]),
        ]
    )
    result = analyze_dora_real(data)
    assert result.lead_time_seconds_median == 3600.0


def test_deploy_frequency_per_day_uses_window():
    """Deploy frequency = deploys / window-days; None if window missing."""
    data = ExternalDORAData(
        deployments=[_deploy(event_id=f"d-{i}") for i in range(30)],
        window_from=_BASE,
        window_to=_BASE + timedelta(days=10),
    )
    result = analyze_dora_real(data)
    assert result.deploy_frequency_per_day == 3.0


def test_deploy_frequency_none_without_window():
    data = ExternalDORAData(
        deployments=[_deploy(event_id="d-1")],
    )
    result = analyze_dora_real(data)
    assert result.deploy_frequency_per_day is None


def _deploy_with_commits(
    *,
    event_id: str,
    change_failure: bool | None,
    commit_shas: list[str],
    remediation_type: str | None = None,
) -> ExternalDeployment:
    commits = [ExternalDeploymentCommit(commit_sha=s) for s in commit_shas]
    return ExternalDeployment(
        provider_event_id=event_id,
        started_at=_BASE,
        change_failure=change_failure,
        remediation_type=remediation_type,
        commits=commits,
    )


def test_cfr_by_origin_per_commit_join():
    """Each commit on each evaluated deploy gets bucketed by its origin."""
    data = ExternalDORAData(
        deployments=[
            # AI deploy that failed
            _deploy_with_commits(
                event_id="d1", change_failure=True, commit_shas=["ai1", "ai2"],
            ),
            # AI deploy that succeeded
            _deploy_with_commits(
                event_id="d2", change_failure=False, commit_shas=["ai3"],
            ),
            # Human deploy that failed
            _deploy_with_commits(
                event_id="d3", change_failure=True, commit_shas=["h1"],
            ),
            # Human deploys that succeeded
            _deploy_with_commits(
                event_id="d4", change_failure=False, commit_shas=["h2", "h3"],
            ),
            _deploy_with_commits(
                event_id="d5", change_failure=False, commit_shas=["h4"],
            ),
        ]
    )
    origin_map = {
        "ai1": "AI_ASSISTED", "ai2": "AI_ASSISTED", "ai3": "AI_ASSISTED",
        "h1": "HUMAN", "h2": "HUMAN", "h3": "HUMAN", "h4": "HUMAN",
    }
    result = analyze_dora_real(data, origin_map=origin_map)
    assert result.cfr_by_origin is not None

    ai = result.cfr_by_origin["AI_ASSISTED"]
    assert ai["failed"] == 2 and ai["evaluated"] == 3  # ai1, ai2 failed; ai3 ok
    assert round(ai["cfr"], 3) == round(2 / 3, 3)

    h = result.cfr_by_origin["HUMAN"]
    assert h["failed"] == 1 and h["evaluated"] == 4  # h1 failed; h2/h3/h4 ok
    assert h["cfr"] == 0.25


def test_cfr_by_origin_skips_unknown_commits_but_reports_coverage():
    """Commits not in origin_map are excluded from origin buckets; org-wide coverage drops."""
    data = ExternalDORAData(
        deployments=[
            _deploy_with_commits(
                event_id="d1",
                change_failure=True,
                commit_shas=["known", "unknown_a"],
            ),
            _deploy_with_commits(
                event_id="d2",
                change_failure=False,
                commit_shas=["unknown_b"],
            ),
        ]
    )
    origin_map = {"known": "AI_ASSISTED"}
    result = analyze_dora_real(data, origin_map=origin_map)

    # Per-origin bucket carries only attributable commits, no coverage_pct.
    assert result.cfr_by_origin == {
        "AI_ASSISTED": {"failed": 1, "evaluated": 1, "cfr": 1.0},
    }
    # Coverage is org-wide: 1 known / (1 known + 2 unknown).
    assert result.cfr_by_origin_coverage_pct == round(1 / 3 * 100, 1)


def test_full_attribution_reports_100_pct_coverage():
    """No unknowns → coverage is 100%."""
    data = ExternalDORAData(
        deployments=[
            _deploy_with_commits(
                event_id="d1", change_failure=False, commit_shas=["a", "b"],
            ),
        ]
    )
    result = analyze_dora_real(
        data, origin_map={"a": "HUMAN", "b": "HUMAN"},
    )
    assert result.cfr_by_origin_coverage_pct == 100.0


def test_coverage_pct_is_none_without_origin_map():
    """Without origin_map, coverage is undefined."""
    data = ExternalDORAData(
        deployments=[_deploy_with_commits(event_id="d1", change_failure=False, commit_shas=["x"])]
    )
    assert analyze_dora_real(data).cfr_by_origin_coverage_pct is None


def test_rollback_rate_by_origin_filters_on_remediation():
    """rollback_rate_by_origin filters failed deploys by remediation_type='rollback'."""
    data = ExternalDORAData(
        deployments=[
            _deploy_with_commits(
                event_id="d1", change_failure=True,
                commit_shas=["ai1"], remediation_type="rollback",
            ),
            _deploy_with_commits(
                event_id="d2", change_failure=True,
                commit_shas=["ai2"], remediation_type="hotfix",
            ),
            _deploy_with_commits(
                event_id="d3", change_failure=True,
                commit_shas=["h1", "h2"], remediation_type="rollback",
            ),
        ]
    )
    origin_map = {
        "ai1": "AI_ASSISTED", "ai2": "AI_ASSISTED",
        "h1": "HUMAN", "h2": "HUMAN",
    }
    result = analyze_dora_real(data, origin_map=origin_map)
    assert result.rollback_rate_by_origin == {
        "AI_ASSISTED": {"rollbacks": 1, "failed": 2, "rollback_rate": 0.5},
        "HUMAN": {"rollbacks": 2, "failed": 2, "rollback_rate": 1.0},
    }


def test_by_origin_none_without_origin_map():
    """Without origin_map, by-origin breakdowns are absent."""
    data = ExternalDORAData(
        deployments=[
            _deploy_with_commits(
                event_id="d1", change_failure=True, commit_shas=["x"],
            ),
        ]
    )
    result = analyze_dora_real(data)  # no origin_map
    assert result.cfr_by_origin is None
    assert result.rollback_rate_by_origin is None
