# Changelog

All notable changes to Iris are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## v1.0.5 — Flow Efficiency: active vs wait of the PR lifecycle (2026-05-12)

### Engine

- `iris/analysis/flow_efficiency.py` (new): decomposes the merged-PR
  lifecycle into four phases (Coding, Awaiting first review, In review,
  Awaiting merge) and reports the fraction of time that was *active*
  event-driven work versus *wait* time. Heuristic for the mixed
  "In review" phase: each event (PR commits + reviews) inside the phase
  claims the next 4 h as active; intervals are unioned. Threshold is
  parametrizable and documented as a hypothesis pending calibration.
- `iris/models/pull_request.py`: introduces `CommitRef(hash,
  committed_at, authored_at)`; replaces `commit_hashes: list[str]` with
  `commit_refs: list[CommitRef]` so PR analyses can find the
  first-commit anchor without re-querying git locally.
- `iris/ingestion/github_reader.py`: extracts `committedDate` and
  `authoredDate` per commit (both already in the gh JSON output).
- `iris/metrics/aggregator.py` + `iris/models/metrics.py`: five new
  fields on `ReportMetrics` — `flow_efficiency_median`,
  `flow_efficiency_by_intent`, `flow_efficiency_by_origin`,
  `time_in_phase_median_hours`, `median_time_to_first_review_hours`.
- `iris/reports/narrative.py` + `iris/i18n.py`: three findings —
  descriptive, "wait dominates" (efficiency < 0.30), and "PRs wait Xh
  until first review" (> 24 h). Thresholds are hypotheses pending
  calibration.
- `iris/cli.py` + `iris/analysis/acceptance_rate.py`: updated to use
  `.hash` on `CommitRef`.

### Privacy (Principle #2)

- Efficiency *per PR* is computed as an intermediate but never persisted
  or surfaced — the schema and UI expose only window-level aggregates.
- `by_intent` and `by_origin` segments require at least
  `min_sample = 10` PRs; below that, the segment is omitted entirely.
- PR origin uses a ≥50% `AI_ASSISTED` commits rule with bot commits
  excluded from both numerator and denominator.

### Platform

- `platform/src/types/metrics.ts`: five new optional fields.
- `platform/src/app/[tenant]/repos/[repoName]/charts.tsx`: new
  `FlowEfficiencyCard` on the repo detail page surfacing the efficiency
  percentage and median time-to-first-review prominently, with a stacked
  horizontal bar of the five phase keys (colored active vs wait) and an
  optional by-intent breakdown.
- `platform/lib/translations.ts`: `flowEfficiency.*` strings in en-US
  and pt-BR.

### Docs

- `docs/METRICS.md`: new section 25 with the phase table, the
  active/wait heuristic, edge cases, and the Principle #2 mitigations.

Closes #17.

---

## v1.0.4 — Flow Load: WIP simultâneo per ISO week (2026-05-12)

### Engine

- `iris/analysis/flow_load.py` (new): counts PRs in flight per ISO week,
  segmented by intent classified from the PR title (FEATURE / FIX /
  REFACTOR / CONFIG / UNKNOWN), plus the number of *distinct* commit
  authors per week as a separate engineering-parallelism proxy. The
  author list itself is never persisted — only the count — to keep this
  aggregate from being usable to rank individuals (Principle #2).
- `iris/models/pull_request.py`: `merged_at` is now optional and the
  model gains `closed_at: datetime | None` and
  `state: Literal["open", "closed", "merged"]`. Required so we can
  represent PRs that were in flight during a window but didn't merge.
- `iris/ingestion/github_reader.py`: fetches PRs in all three states
  (merged, closed-without-merge, open) and keeps the ones whose
  lifecycle overlaps the analysis window; the previous merged-only
  scan was insufficient for WIP counting. Consumers that semantically
  require merged PRs (`pr_lifecycle`, `activity_timeline`,
  `acceptance_rate`) now filter explicitly on `state == "merged"`.
- `iris/metrics/aggregator.py` + `iris/models/metrics.py`: new
  `flow_load` field on `ReportMetrics` (list of `FlowLoadWeek`).
- `iris/reports/narrative.py` + `iris/i18n.py`: descriptive Flow Load
  finding when data exists, plus an optional feature-growth finding
  with thresholds documented as hypotheses pending calibration.

### Platform

- `platform/src/types/metrics.ts`: `FlowLoadWeek` interface +
  optional `flow_load` field.
- `platform/src/app/[tenant]/repos/[repoName]/charts.tsx`: new
  `FlowLoadCard` rendered on repo detail pages — stacked area by intent
  with `author_concurrency` as a line on a right-side axis. Visible
  only when the payload includes at least two buckets.

### Docs

- `docs/METRICS.md`: new section 24 documenting the overlap rule, edge
  cases, coverage limitations ("engineering WIP only — backlog/design/
  local-branch work do not appear"), and the privacy contract around
  `author_concurrency`.

Closes #16.

---

## v1.0.3 — `iris upgrade` delegates to install.sh (2026-05-12)

### Fixed

- `iris upgrade` was wired to a `${SERVER_URL}/dist/latest.txt` endpoint
  that never existed and defaulted to `http://localhost:3000` because
  it ignored `~/.iris/config.json`. Combined with a stale
  `pipx install --force` call (broken since uv started managing the
  underlying venv), the command produced "Connection refused" or a
  failed venv creation depending on the path it took.
- Rewrite the command to shell out to `curl <server>/install.sh | sh`
  using the install URL from config.json (or `IRIS_SERVER_URL`).
  install.sh is the single source of truth for version resolution,
  install-method detection, and the uninstall-then-install dance on
  pipx — duplicating that logic here drifts immediately.

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
