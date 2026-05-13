"""Fetch external DORA events from the Iris platform.

The engine never talks to Datadog directly. When the CLI is logged in to
a platform and the org has an active Datadog integration, this module
pulls pre-synced events from ``GET /api/integrations/datadog/events``
and hands back an :class:`ExternalDORAData` for the aggregator.

The fetch is opportunistic: on any failure (no auth, no integration,
network error, malformed payload) the CLI logs a warning and falls
through with ``None``. The analysis still ships, the DORA section in
the report just stays empty.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from iris.models.external import (
    ExternalDeployment,
    ExternalDeploymentCommit,
    ExternalDORAData,
    ExternalIncident,
)


logger = logging.getLogger(__name__)


def fetch_external_dora(
    server_url: str,
    token: str,
    window_from: datetime,
    window_to: datetime,
    repository_id: str | None = None,
    timeout_seconds: float = 30.0,
) -> ExternalDORAData | None:
    """Fetch DORA events from the platform.

    Returns ``None`` on any failure or when the org has no active
    Datadog integration. The caller should pass ``None`` to the
    aggregator in that case.
    """
    params = {
        "from": _isoformat_utc(window_from),
        "to": _isoformat_utc(window_to),
    }
    if repository_id:
        params["repository_id"] = repository_id

    url = (
        f"{server_url.rstrip('/')}/api/integrations/datadog/events"
        f"?{urllib.parse.urlencode(params)}"
    )

    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        logger.warning(
            "External DORA fetch returned HTTP %s; skipping. Body: %s",
            e.code,
            body[:200],
        )
        return None
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
        logger.warning("External DORA fetch failed: %s; skipping.", e)
        return None

    if not isinstance(payload, dict):
        logger.warning("External DORA response was not an object; skipping.")
        return None

    source = payload.get("source")
    if source != "datadog":
        # No active integration — return None so the aggregator skips
        # the DORA fields entirely.
        return None

    deployments = [
        _deployment_from_payload(d)
        for d in payload.get("deployments", [])
        if isinstance(d, dict)
    ]
    incidents = [
        _incident_from_payload(i)
        for i in payload.get("incidents", [])
        if isinstance(i, dict)
    ]

    return ExternalDORAData(
        deployments=deployments,
        incidents=incidents,
        source="datadog",
        window_from=window_from,
        window_to=window_to,
    )


def _deployment_from_payload(p: dict) -> ExternalDeployment:
    commits = [
        ExternalDeploymentCommit(
            commit_sha=c.get("commit_sha", ""),
            commit_timestamp=_parse_iso(c.get("commit_timestamp")),
            author_email=c.get("author_email"),
            author_canonical_email=c.get("author_canonical_email"),
            is_bot=c.get("is_bot"),
            change_lead_time=c.get("change_lead_time"),
            time_to_deploy=c.get("time_to_deploy"),
        )
        for c in p.get("commits") or []
        if isinstance(c, dict) and c.get("commit_sha")
    ]
    return ExternalDeployment(
        provider_event_id=p.get("provider_event_id", ""),
        started_at=_parse_iso(p.get("started_at")) or datetime.fromtimestamp(0, tz=timezone.utc),
        finished_at=_parse_iso(p.get("finished_at")),
        service=p.get("service"),
        env=p.get("env"),
        team=p.get("team"),
        version=p.get("version"),
        commit_sha=p.get("commit_sha"),
        change_failure=p.get("change_failure"),
        recovery_time_sec=p.get("recovery_time_sec"),
        remediation_type=p.get("remediation_type"),
        deployment_type=p.get("deployment_type"),
        source=p.get("source"),
        duration_seconds=p.get("duration_seconds"),
        number_of_commits=p.get("number_of_commits"),
        number_of_pull_requests=p.get("number_of_pull_requests"),
        commits=commits,
        dd_repository_id=p.get("dd_repository_id"),
        repository_matched=p.get("repository_id") is not None,
    )


def _incident_from_payload(p: dict) -> ExternalIncident:
    return ExternalIncident(
        provider_event_id=p.get("provider_event_id", ""),
        started_at=_parse_iso(p.get("started_at")) or datetime.fromtimestamp(0, tz=timezone.utc),
        finished_at=_parse_iso(p.get("finished_at")),
        name=p.get("name"),
        severity=p.get("severity"),
        time_to_restore_seconds=p.get("time_to_restore_seconds"),
        services=tuple(p.get("service") or ()),
        envs=tuple(p.get("env") or ()),
        teams=tuple(p.get("team") or ()),
        source=p.get("source"),
    )


def _isoformat_utc(d: datetime) -> str:
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        # fromisoformat accepts trailing "Z" only from Python 3.11+; we
        # support 3.13 globally but stay defensive.
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
