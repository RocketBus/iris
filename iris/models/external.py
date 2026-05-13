"""External provider data (Datadog DORA events) consumed by the engine.

The engine never talks to Datadog directly. The platform ingests events
into Supabase (see `platform/lib/integrations/datadog/sync.ts`) and the
CLI fetches them via `GET /api/integrations/datadog/events` before
invoking the aggregator. These dataclasses are the in-memory shape the
analysis modules consume.
"""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class ExternalDeploymentCommit:
    """Per-commit detail unpacked from a Datadog deployment event."""

    commit_sha: str
    commit_timestamp: datetime | None = None
    author_email: str | None = None
    author_canonical_email: str | None = None
    is_bot: bool | None = None
    # Seconds. From `attributes.commits[].change_lead_time`.
    change_lead_time: int | None = None
    # Seconds. From `attributes.commits[].time_to_deploy`.
    time_to_deploy: int | None = None


@dataclass(frozen=True)
class ExternalDeployment:
    """A single DORA deployment event from Datadog (one row in `external_deployments`)."""

    provider_event_id: str
    started_at: datetime
    finished_at: datetime | None = None
    service: str | None = None
    env: str | None = None
    team: str | None = None
    version: str | None = None
    commit_sha: str | None = None
    # Tri-state: True | False | None (None = Datadog hasn't evaluated yet).
    # CFR denominator must exclude None deployments.
    change_failure: bool | None = None
    # Present only when change_failure is True.
    recovery_time_sec: int | None = None
    remediation_type: str | None = None  # "rollback" observed; "hotfix"/"forward_fix" documented
    deployment_type: str | None = None
    source: str | None = None
    duration_seconds: int | None = None
    number_of_commits: int | None = None
    number_of_pull_requests: int | None = None
    commits: list[ExternalDeploymentCommit] = field(default_factory=list)
    dd_repository_id: str | None = None
    repository_matched: bool = False


@dataclass(frozen=True)
class ExternalIncident:
    """A single DORA failure event from Datadog (one row in `external_incidents`)."""

    provider_event_id: str
    started_at: datetime
    finished_at: datetime | None = None
    name: str | None = None
    severity: str | None = None
    # Seconds. From `attributes.time_to_restore`.
    time_to_restore_seconds: int | None = None
    services: tuple[str, ...] = field(default_factory=tuple)
    envs: tuple[str, ...] = field(default_factory=tuple)
    teams: tuple[str, ...] = field(default_factory=tuple)
    source: str | None = None


@dataclass(frozen=True)
class ExternalDORAData:
    """Pre-fetched DORA events for the analysis window."""

    deployments: list[ExternalDeployment] = field(default_factory=list)
    incidents: list[ExternalIncident] = field(default_factory=list)
    # Provider identifier ("datadog"); persisted on the metric as `dora_source`.
    source: str = "datadog"
    # The window the events were fetched against. The engine doesn't enforce
    # it — the caller is responsible for fetching events that already match
    # the analysis window. Stored here for traceability in the report.
    window_from: datetime | None = None
    window_to: datetime | None = None
