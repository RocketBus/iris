# DECISIONS.md — Iris Architectural Memory

## Purpose

This document records important decisions made during the evolution of Iris.

AI agents do not retain persistent reasoning across sessions.  
This file acts as the long-term memory of the project.

Before proposing architectural changes, agents MUST read this document.

Decisions recorded here should be treated as intentional unless explicitly revised.

---

## Decision Format

Each decision follows:

- Date
- Decision
- Context
- Rationale
- Consequences

---

## 2026-XX-XX — Iris Starts as an Analysis Engine, Not a Platform

### Decision

Iris will begin as a repository analysis engine and report generator instead of a SaaS platform.

### Context

The project is in a discovery phase focused on identifying meaningful engineering intelligence signals.

Building platform infrastructure too early risks optimizing around incorrect assumptions.

### Rationale

Insight discovery precedes platform design.

We must first learn:

- which signals matter
- which metrics are meaningful
- which analyses create executive value

Only after validated insights should platform concerns emerge.

### Consequences

- No authentication systems.
- No multi-tenancy.
- No billing logic.
- No enterprise backend architecture.

Simple execution environments are preferred.

---

## 2026-XX-XX — Systems Over Individuals

### Decision

Iris analyzes engineering systems, never individual developers.

### Context

Many productivity tools drift into individual performance monitoring, creating ethical and adoption risks.

### Rationale

Engineering outcomes emerge from systems and collaboration patterns, not isolated individuals.

Focusing on individuals creates surveillance dynamics and reduces trust.

### Consequences

Agents must NOT implement:

- developer rankings
- individual productivity scores
- behavioral monitoring features

All analysis must aggregate at team or repository level.

---

## 2026-XX-XX — Metrics Are Experimental Constructs

### Decision

All metrics are treated as hypotheses rather than fixed definitions.

### Context

The AI era introduces unknown dynamics in software delivery.

Prematurely solidifying metrics would freeze incorrect assumptions.

### Rationale

Iris is partially a research system.

Metrics must evolve through experimentation and observation.

### Consequences

- Metrics should be configurable.
- Formulas must remain transparent.
- Avoid hardcoded constants without explanation.
- Document assumptions inside code.

---

## 2026-XX-XX — Insight First, UI Later

### Decision

Insights and reports take priority over dashboards and visual interfaces.

### Context

Early analytics products often overinvest in UI before validating analytical value.

### Rationale

If insights are valuable, presentation can evolve later.

If insights are weak, UI investment is wasted.

### Consequences

- Reports are acceptable primary outputs.
- CLI or generated documents are sufficient.
- Visualization complexity is intentionally delayed.

---

## 2026-XX-XX — Minimal Architecture Principle

### Decision

Iris avoids complex architecture until analytical value is proven.

### Context

LLMs and engineers tend to introduce scalable architectures prematurely.

### Rationale

Complexity slows iteration and hides analytical mistakes.

Speed of learning is the main competitive advantage at this stage.

### Consequences

Avoid introducing:

- microservices
- event-driven systems
- background workers
- distributed queues
- heavy frameworks

Prefer simple modules and direct execution flow.

---

## 2026-XX-XX — AI Impact Is Measured Indirectly

### Decision

Iris will not attempt direct detection of AI-generated code.

### Context

AI tooling changes rapidly and vendor-specific detection is fragile.

### Rationale

Behavioral patterns are more stable than tooling identifiers.

We measure outcomes, not tools.

### Consequences

Focus analysis on:

- churn patterns
- stabilization time
- rework frequency
- revert signals
- delivery durability

Not on IDE telemetry.

---

## 2026-04-12 — Stage Model Formalized: Signal Discovery → Adoption → Platform → Scale

### Decision

Iris adopts an explicit four-stage product model:

- Stage 0 — Signal Discovery (complete)
- Stage 1 — Attribution & Adoption (substantially complete)
- Stage 2 — Intelligence Platform MVP (current)
- Stage 3 — Scale & Enterprise Readiness (next)

### Context

The project previously operated under a two-label model ("Stage 0 current" vs "Stage 2+ future"). Reality had moved well past that: 30 analysis modules validated, attribution hooks deployed, a multi-tenant Next.js + Supabase platform ingesting real metrics. Docs and code were out of sync, creating ambiguous guidance for contributors and agents.

### Rationale

Explicit stages give a shared frame for scope decisions. "Is this Stage 2 refinement or Stage 3 work?" is easier to answer than "are we still discovering signals?".

### Consequences

- CLAUDE.md, VISION.md, and ONE-PAGER.md updated to reflect Stage 2 as current.
- Non-goals lists realigned: authentication, multi-tenancy, and the dashboard are no longer prohibited — they exist and are in scope for Stage 2 refinement.
- Stage 3 items (SSO, billing, webhooks, cross-system correlation, benchmarking) remain explicit non-goals until Stage 3 is formally opened.

---

## 2026-04-12 — Revises "Insight First, UI Later": Engine Still Leads, Platform Exists

### Decision

The earlier "Insight First, UI Later" decision is refined: the engine continues to lead product direction, but the platform UI is an accepted first-class surface rather than a deferred concern.

### Context

The original decision warned against investing in UI before analytical value was validated. That validation has happened (30 modules, 58 repos, real findings). A Next.js platform already exists and ingests real metrics.

### Rationale

Insights only compound if consumers can act on them. For multi-repo, temporal, and cross-team comparisons, static Markdown reports hit a ceiling that a dashboard clears.

The original guardrail still matters in a softer form: no UI view ships without a validated insight behind it.

### Consequences

- Platform features are allowed when tied to validated analytical output.
- Dashboard sprawl remains a non-goal: each view must justify itself against an engine-level signal.
- If a candidate platform feature requires a new signal the engine does not produce, the engine work happens first.
- Supersedes but does not delete the earlier "Insight First, UI Later" entry.

---

## 2026-04-12 — Revises "Starts as Analysis Engine, Not Platform": Platform Is Part of the Product

### Decision

Iris is an analysis engine **and** a multi-tenant platform that consumes its output. The platform is part of the product, not a future optional surface.

### Context

The original decision (dated 2026-XX-XX above) prohibited authentication, multi-tenancy, and enterprise backend architecture on the grounds that platform work was premature. Since then, the engine has been validated and a platform has been built with NextAuth (email/password + optional Google OAuth + 2FA), Supabase multi-tenancy, token-authenticated ingestion, and Docker deployment.

### Rationale

Keeping insights on disk artificially caps the audience and blocks the multi-repo, temporal, and cross-team views that Stage 3 will depend on. A platform is the natural consumer of what the engine produces.

### Consequences

- `platform/` is a supported, maintained part of the repository.
- Authentication, basic multi-tenancy (org/member/role), and CLI token auth are no longer non-goals.
- Enterprise concerns — SSO, fine-grained RBAC, SCIM, billing activation, webhooks — remain deferred until Stage 3.
- Supersedes but does not delete the earlier "Starts as an Analysis Engine, Not a Platform" entry.

---

## Revising Decisions

Decisions may evolve.

When changing a decision:

1. Do not delete the original.
2. Add a new entry referencing the previous one.
3. Explain why understanding changed.

Iris evolves through learning, not rewriting history.

---

## Guiding Principle

If a proposal conflicts with an existing decision, the decision wins unless explicitly revised.

Consistency of reasoning is more important than novelty.

---
