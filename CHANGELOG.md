# Changelog

All notable changes to Iris are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## v1.0.0 — Initial open-source release (2026-05-02)

First public release of Iris under the [Apache License 2.0](LICENSE).

Iris is an engineering intelligence system that analyzes Git history to measure delivery durability and the impact of AI-assisted development. This release ships two components that version independently:

- **`iris` CLI** (`iris/`) — Python 3.11+ analysis engine. Reads commits, PRs, and code-survival data locally; produces a Markdown report plus JSON metrics. Zero external dependencies for the core path; optional OpenTelemetry export for users who opt in.
- **Iris Platform** (`platform/`) — Next.js 16 multi-tenant dashboard. Ingests metrics over a token-authenticated `/api/ingest` endpoint and surfaces cross-repo views, AI exposure, and trends.

### Key features

- **30 analysis modules** covering origin classification, intent classification, code durability (line survival via `git blame`), correction cascades, fix targeting, attribution gaps, PR insights, activity timelines, stability maps, and trend analysis
- **AI tool detection** for Claude, Cursor, Copilot, Windsurf and other assistants via co-author trailers, prepare-commit-msg hooks, and velocity patterns
- **Multi-tenant platform** with GitHub OAuth, organization mirroring of GitHub orgs, and per-org Row-Level Security
- **i18n support** in en-US, pt-BR, and es-ES (with automatic detection via cookie + `Accept-Language`)
- **Apache 2.0 license** — permissive, includes patent grant, allows commercial reuse including SaaS

### What this release explicitly does NOT include

By design (see [`CLAUDE.md`](CLAUDE.md) and [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md)):

- No individual developer ranking, scoring, or productivity tracking
- No real-time monitoring or live alerts
- No IDE plugins or vendor-specific AI telemetry
- No telemetry by default — `OTEL_EXPORTER_OTLP_ENDPOINT` is opt-in (see [`docs/TELEMETRY.md`](docs/TELEMETRY.md))

### Documentation

- [`README.md`](README.md) — quick start, architecture diagram, CLI usage
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — local setup and PR workflow
- [`SECURITY.md`](SECURITY.md) — vulnerability disclosure
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — Contributor Covenant 2.1
- [`docs/VISION.md`](docs/VISION.md), [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md), [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md), [`docs/METRICS.md`](docs/METRICS.md) — product context and the canonical metric dictionary
- [`platform/VERCEL.md`](platform/VERCEL.md) — deploy steps for the platform
