# Changelog

All notable changes to Iris are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## v1.0.2 — Per-week AI commit breakdown for /me/ai-usage trend (2026-05-12)

### Engine

- `iris/analysis/author_velocity.py`: `AuthorWeek` now carries `ai_commits`
  alongside `commits`/`lines_added`/`lines_removed`. The to_dict output
  emits it under `author_velocity.authors[].weekly[].ai_commits` so the
  platform can compute a weekly AI share per author without re-running
  origin classification client-side. Older payloads stay compatible —
  the new field is additive.

### Platform

- `/me/ai-usage` trend chart now buckets by the actual commit week
  (from `author_velocity.authors[].weekly`) instead of metric ingestion
  timestamp. A first-time `iris push` of several repos on the same day
  no longer collapses to a single point — the user's full commit
  history is plotted as soon as the engine has emitted at least two
  weeks of activity.
- After upgrading the CLI (`iris upgrade`), re-run `iris ... --push`
  on each repo to regenerate payloads with the new `ai_commits`
  per-week field. Old payloads still render commit counts; AI share
  per week is only available from v1.0.2-generated payloads onward.

---

## v1.0.1 — Fork-friendly and operator-agnostic (2026-05-11)

First patch release after the open-source debut. Decouples the CLI and platform
from Clickbus-specific branding and deployment so any organization can fork or
self-host without forking text.

### Breaking

- **Package renamed.** The Python distribution is now `iris` (was `clickbus-iris`).
  Wheels are published as `iris-X.Y.Z-py3-none-any.whl` in GitHub Releases.
  Re-install via the install script or `pip install iris`.
- **Synthetic AI co-author email domain.** Switched from `@iris.clickbus.com`
  to `@iris.invalid` (RFC 6761 reserved TLD, guaranteed never routable).
  Override with `IRIS_AGENT_EMAIL_DOMAIN` if you want a different domain.
  Legacy trailers continue to be detected by tool name (Claude / Cursor /
  Copilot / Windsurf / etc.), so existing history is not lost.

### Changed

- **Server URL is env-driven.** `iris login` and `iris upgrade` now read
  `IRIS_SERVER_URL` (default `http://localhost:3000`) instead of hard-coding
  a domain. Install scripts and platform metadata also read `NEXT_PUBLIC_APP_URL`.
- **Privacy Policy / Terms of Service are operator-parameterized.** Forks and
  self-hosters declare their legal entity via `NEXT_PUBLIC_OPERATOR_NAME`,
  `NEXT_PUBLIC_OPERATOR_JURISDICTION`, `NEXT_PUBLIC_OPERATOR_PRIVACY_EMAIL`,
  and `NEXT_PUBLIC_OPERATOR_DPO_EMAIL`. Empty values render explicit
  "[not configured]" placeholders.
- **Security contact.** `SECURITY.md` and the Code of Conduct point at GitHub
  Security Advisories with optional `SECURITY_CONTACT_EMAIL` override.

### Security

- **Platform deps:** `next` bumped to 16.2.6 (resolves 13 Dependabot advisories
  including Middleware/Proxy bypasses, WebSocket SSRF, Cache Components DoS,
  Server Components DoS, RSC cache poisoning, and CSP-nonce XSS).
  `@opentelemetry/sdk-node` and `@opentelemetry/instrumentation-http` bumped
  to 0.217.0 (Prometheus exporter crash).
- **CI:** GitHub Actions bumped to current majors (`actions/checkout@v6`,
  `actions/setup-python@v6`).

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
