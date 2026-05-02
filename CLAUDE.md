# CLAUDE.md — Iris Agent Context

## Project Overview

Iris is an engineering intelligence system that studies how AI changes software delivery.

It combines a Python analysis engine (`iris/`) with a multi-tenant Next.js platform (`platform/`) that ingests metrics from the CLI and surfaces them through a dashboard.

The goal is to turn repository history into durable insight about delivery quality in the AI era.

See also:
- docs/VISION.md
- docs/PRINCIPLES.md
- docs/DECISIONS.md
- docs/METRICS.md — canonical dictionary of every metric field

---

## Current Objective

Deepen the intelligence loop: improve signal quality in the engine, expand attribution coverage, and make the platform the primary surface for consuming insights across repositories and time.

All development should still trace back to the core question: **does this help us understand how AI changes software delivery?**

---

## Development Stages

| Stage | Theme | Status |
|---|---|---|
| 0 | Signal Discovery | Complete — 30 analysis modules validated on 58 repos, 3.5k commits, 1.2k PRs |
| 1 | Attribution & Adoption | Substantially complete — `prepare-commit-msg` hooks, `iris hook install`, co-author policy guide, CLI push with OAuth |
| 2 | Intelligence Platform (MVP) | **Current** — Next.js + Supabase + NextAuth multi-tenant app ingesting real metrics via `POST /api/ingest`, dashboard + repos + compare views shipping |
| 3 | Scale & Enterprise Readiness | Next — SSO, fine-grained RBAC, cross-system correlation (CI, incidents), anonymized benchmarking |

Work that lands should fit Stage 2 refinement or prepare Stage 3 — not re-open Stage 0 assumptions without justification.

---

## Focus Areas (Stage 2)

- Engine: tighten signal quality, reduce noise, cover attribution gaps
- Platform: repo/org views, comparison, temporal intelligence, health scoring
- Ingestion: reliability of CLI → `/api/ingest` pipeline, token auth, idempotency
- Onboarding: `iris login`, `iris hook install`, first-run flows

---

## Absolute Rules

1. Optimize for simplicity.
2. Prefer explicit logic over abstraction.
3. Avoid premature architecture — especially for features not yet in Stage 2/3 scope.
4. Metrics are hypotheses, not truths.
5. Analyze systems, never rank or score individuals.

---

## Explicit Non-Goals (current)

Do NOT introduce:

- individual developer ranking, scoring, or productivity tracking (permanent — see Principle #2)
- real-time monitoring or alerting on live commits
- IDE plugins or vendor-specific AI telemetry (permanent — see Principle #7)
- dashboard sprawl: each new view must tie to a validated insight, not a hypothetical user
- microservices, event buses, or distributed queues in the platform
- enterprise abstractions (RBAC matrix, policy engines, SCIM) before Stage 3 is opened
- billing, webhooks, or external integrations (the original SaaS scaffold had these; they were intentionally removed)

If unsure, choose the simpler implementation.

---

## Coding Principles

- Write small, readable functions.
- Prefer explicit logic over abstraction.
- Favor deterministic outputs.
- Document assumptions clearly.
- Avoid speculative extensibility.

Readable code is more important than scalable code.

---

## Design Philosophy

Iris is an intelligence product, not a productivity tracker.

Engine insights drive what the platform shows — not the reverse. A new UI view must be justified by a metric that already tells a useful story in the engine.

---

## Release Checklist

When creating a new version tag:

1. `pyproject.toml` — update `version`
2. `iris/cli.py` — update `VERSION`
3. `CHANGELOG.md` — add entry at the top
4. Commit, push, then `git tag -a vX.Y.Z`

When adding a new analysis metric, complete the full chain:

1. Analysis module (`iris/analysis/`)
2. Aggregator wiring (`iris/metrics/aggregator.py`)
3. Python schema (`iris/models/metrics.py`)
4. Report writer (`iris/reports/writer.py`)
5. Narrative findings (`iris/reports/narrative.py`) — if threshold-based insight applies
6. TypeScript types (`platform/src/types/metrics.ts`)
7. Platform UI — if the metric should be visible in the dashboard

When adding a new AI tool to the hook (`iris/hooks/prepare_commit_msg.sh`), also add it to:

1. `_AI_CO_AUTHOR_PATTERNS` regex in `iris/analysis/origin_classifier.py`
2. `_TOOL_PATTERNS` list in `iris/analysis/origin_classifier.py`

---

## Issue Tracking

All issues, PRDs, bugs, and tickets live in **GitHub Issues** at `RocketBus/clickbus-iris`. Never track work in scratch files, Notion, or inline TODOs when a proper issue is warranted.

Use `gh issue create` with the appropriate template — blank issues are blocked. Templates live in `.github/ISSUE_TEMPLATE/`:

| Template | Title prefix | Label | When to use |
|---|---|---|---|
| `bug.yml` | `[BUG]` | `type: bug` | Something works incorrectly, crashes, or regresses |
| `feature.yml` | `[FEAT]` | `type: feature` | New functionality |
| `tech-debt.yml` | `[DEBT]` | `type: tech-debt` | Known sub-optimal code or workaround to pay down |
| `metric.yml` | `[METRIC]` | `type: metric` | New metric or change to an existing metric |

Rules:

- Fill every required field — templates exist so triage is fast, not for ceremony.
- New metrics MUST use `metric.yml` — the template enforces the full chain (analysis → aggregator → schema → report → narrative → TS types → UI → `docs/METRICS.md`).

Creating issues via CLI:

```bash
gh issue create --repo RocketBus/clickbus-iris --template bug.yml
gh issue create --repo RocketBus/clickbus-iris --template feature.yml
# etc.
```

---

## Decision Test

Before implementing anything, ask:

"Does this help us understand how AI changes software delivery?"

If the answer is unclear, do not implement it.

---
