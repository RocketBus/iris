# Telemetry

Iris emits OpenTelemetry traces and metrics **only when you explicitly opt in**. By default, the CLI sends nothing — no usage pings, no anonymous metrics, no error reports.

## Default behavior: silent

Out of the box:
- The `opentelemetry-*` packages are **optional dependencies**, not installed by `pip install iris`. They only come in via `pip install 'iris[otel]'`.
- Even with the OTel packages installed, no spans or metrics are emitted unless you set `OTEL_EXPORTER_OTLP_ENDPOINT`.
- The single exception is `IRIS_OTEL_DEBUG=1`, which prints OTel events to stdout for local debugging — useful when verifying the exporter works.

This is implemented in [`iris/platform/telemetry.py`](../iris/platform/telemetry.py): if either the SDK is missing or the endpoint is unset, every helper (`span()`, `record_metric()`, `record_counter()`, `record_duration()`) is a no-op.

## What is collected (when enabled)

When you enable telemetry, Iris emits structured OTel data describing **the analysis run**, not the source code being analyzed. Concretely:

**Spans** (timing + structure of operations):
- Subcommands (`iris <repo>`, `iris pr`, `iris hook install`)
- Ingestion phases (commit reading, PR reading, GitHub queries)
- Analysis modules (origin classifier, churn calculator, durability, …)

**Metrics** (counters and gauges):
- `iris.run.duration` — total wall-clock time
- `iris.commits.processed` — commit count
- `iris.prs.processed` — PR count
- `iris.errors` — counter for analysis errors

**Span attributes** (annotations on spans):
- Repository name (the basename of the path you passed)
- Window in days
- Detected AI tools (Claude, Cursor, Copilot, Windsurf, …)

## What is NOT collected

The CLI **never sends**:
- Source code, diffs, or commit messages
- Author names, emails, or any per-commit personal data
- Repository contents beyond what `git log` exposes
- Hostname, IP, machine identifier, or environment variables other than the explicitly listed OTel config

If you find a place where Iris is doing more than this, that's a bug — please [file an issue](https://github.com/RocketBus/clickbus-iris/issues) or follow [SECURITY.md](../SECURITY.md) for sensitive disclosure.

## How to enable

Pick a destination that speaks OTLP/HTTP. Examples:

### Honeycomb

```bash
pip install 'iris[otel]'
export OTEL_EXPORTER_OTLP_ENDPOINT="https://api.honeycomb.io"
export OTEL_EXPORTER_OTLP_HEADERS="x-honeycomb-team=YOUR_API_KEY"
export OTEL_SERVICE_NAME="iris-cli"
iris /path/to/repo
```

### Grafana Tempo / Loki / Mimir

```bash
pip install 'iris[otel]'
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp-gateway.example.com"
export OTEL_EXPORTER_OTLP_HEADERS="authorization=Basic <base64>"
iris /path/to/repo
```

### Local Jaeger / Otel Collector for debugging

```bash
docker run -d -p 4318:4318 -p 16686:16686 jaegertracing/all-in-one
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
iris /path/to/repo
# Open http://localhost:16686
```

### Print to stdout (no export, debug only)

```bash
export IRIS_OTEL_DEBUG=1
iris /path/to/repo
```

## How to disable

Just don't set `OTEL_EXPORTER_OTLP_ENDPOINT`. If you want to be paranoid, also `pip uninstall opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp-proto-http` — without those packages, the import fails silently and Iris no-ops every telemetry call.

## CI

In CI, telemetry is off by default. If you want runs to emit traces, set the OTel env vars in your runner's secret store and they'll flow through naturally.

## Why this design

Three guarantees up front:

1. **Opt-in, not opt-out.** Surveillance-by-default is a non-starter for a tool that touches private repos.
2. **No vendored backend.** Iris doesn't phone home to a vendor-controlled endpoint. You point it at your own observability stack.
3. **No source content.** Even when telemetry is on, the wire payload is metric values and span names, never code.

If you want Iris to send anonymous usage stats to help us prioritize features, that's a feature we don't have and currently don't plan to add. Open an issue if that changes your mind.
