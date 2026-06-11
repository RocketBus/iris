"""Data models for AI-agent usage telemetry (epic #65, ADR 2026-06-11).

Two layers, deliberately separated by the privacy boundary:

- ``SessionAggregate`` / ``ParsedSession`` are *local* — the reduced output of
  parsing one transcript on the developer's machine. They never carry prompt
  text, code, or tool arguments (the parser never reads those fields), but they
  are produced from a local ``transcript_path``/``cwd`` and are NOT yet stripped
  to the wire contract.

- ``UsageRecord`` is the *network* contract: the only shape that may leave the
  machine. Grain is ``(repo, period, model)`` per the ADR. There is no ``user``
  column, no host, no path, no exact timestamp — identity is gone by
  construction, not by policy.

See docs/DECISIONS.md (2026-06-11) and docs/PRINCIPLES.md #7.
"""

from dataclasses import dataclass

# Wire schema identifier. Bump when the UsageRecord shape changes so #68's
# ingest endpoint can reject or migrate older payloads.
USAGE_SCHEMA = "iris.agent_usage.v1"


@dataclass(frozen=True)
class SessionAggregate:
    """Usage for one ``(model, period)`` slice of a single local session.

    Local-only. A session that spans two models (or crosses UTC midnight)
    produces more than one of these.
    """

    model: str
    period: str  # UTC day, YYYY-MM-DD, derived from message timestamps
    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int
    cache_creation_input_tokens: int
    tool_calls: int
    sidechain_tool_calls: int
    assistant_messages: int


@dataclass(frozen=True)
class ParsedSession:
    """Result of parsing one transcript: per-(model, period) slices plus the
    session's wall-clock span (local-only, used to bucket duration)."""

    aggregates: tuple[SessionAggregate, ...]
    first_ts: str | None  # ISO timestamp of the first assistant turn (local)
    last_ts: str | None  # ISO timestamp of the last assistant turn (local)


@dataclass(frozen=True)
class UsageRecord:
    """Anonymous, network-safe usage row. The ONLY shape that leaves the edge.

    Aggregated to ``(repo, period, model)``. Carries no identity: not user,
    email, host, path, branch, or exact time. ``idempotency_key`` is an opaque
    hash of the random session id — it lets #68 dedupe re-sends without ever
    revealing who ran the session.
    """

    repo: str  # owner/repo, derived from the local git remote then discarded
    period: str  # UTC day, YYYY-MM-DD — exact timestamps never leave the edge
    model: str
    agent: str  # adapter id, e.g. "claude_code"
    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int
    cache_creation_input_tokens: int
    tool_calls: int
    sidechain_tool_calls: int
    sessions: int  # distinct sessions folded into this row (1 at the edge)
    duration_bucket: str  # coarse session length, e.g. "15-60m"
    idempotency_key: str  # opaque hash of session id; not identity
    schema: str = USAGE_SCHEMA

    def to_wire(self) -> dict:
        """Serialize to the JSON object that #68's ingest endpoint receives."""
        return {
            "schema": self.schema,
            "agent": self.agent,
            "repo": self.repo,
            "period": self.period,
            "model": self.model,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cache_read_input_tokens": self.cache_read_input_tokens,
            "cache_creation_input_tokens": self.cache_creation_input_tokens,
            "tool_calls": self.tool_calls,
            "sidechain_tool_calls": self.sidechain_tool_calls,
            "sessions": self.sessions,
            "duration_bucket": self.duration_bucket,
            "idempotency_key": self.idempotency_key,
        }
