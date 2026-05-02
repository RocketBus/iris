# Iris — Vision Document

## Purpose

Iris exists to understand how Artificial Intelligence is changing software engineering.

Code is increasingly produced through collaboration between humans and AI assistants. Traditional engineering metrics were designed for a world where developers manually wrote most of the code. That world no longer exists.

Iris makes the invisible dynamics of AI-assisted delivery measurable.

---

## The Problem

Organizations are rapidly adopting AI coding tools, but they cannot answer fundamental questions:

- Is AI-assisted code more durable or more disposable?
- Are teams shipping more value or just more code?
- Does AI reduce lead time or increase rework?
- Which areas of the codebase are stable and which are in constant churn?
- Where is AI being used but not attributed?

Existing analytics platforms measure throughput and velocity, but they assume a human-only production model. AI breaks these assumptions. More commits no longer mean more productivity. Faster pull requests do not necessarily mean better outcomes. Higher activity may hide growing instability.

---

## Core Insight

AI amplifies both productivity and instability.

> The key challenge of AI-assisted development is not measuring output, but measuring the ratio between durable delivery and corrective effort.

We call this **Engineering Signal vs Noise**.

- **Signal** — changes that persist, stabilize, and survive code review
- **Noise** — changes that require correction, rework, or rapid re-editing

Iris makes this ratio measurable at every level: file, directory, repository, and organization.

---

## What We've Proven

Iris has been validated on a real organization (58 repositories, 3,497 commits, 1,211 PRs) across 30 analysis modules. Key findings:

**AI code is more durable.** In repositories with both human and AI commits, AI-assisted code stabilizes at 79% vs 64% for human code. Line survival rate for AI code is 90-100%.

**Correction cascades reveal code quality.** 30% of commits trigger follow-up fixes. AI-assisted repos with proper attribution show 0% cascade rate in scaffolded projects.

**Attribution is the bottleneck.** 43 of 58 repositories show zero AI detection — not because AI isn't used, but because tools like Copilot and Cursor don't leave attribution traces. 45% of "human" commits match high-velocity patterns consistent with AI assistance.

**File coupling explains instability.** Automated coupling detection found 4 messaging client implementations with 100% co-change rate — any feature touching one client requires changing all four. This architectural insight was invisible before.

**Temporal patterns tell the story.** Weekly activity timelines with pattern detection (burst-then-fix, quiet periods, intent shifts) explain *why* metrics changed, not just *that* they changed.

---

## What Iris Is

Iris is an engineering intelligence engine that analyzes delivery systems using signals derived from Git repositories and pull requests.

It is not:

- a developer productivity tracker
- a surveillance tool
- an IDE plugin
- a performance monitoring system for individuals

It is:

- a system-level analytics engine
- a delivery durability measurement framework
- an AI attribution and impact analysis platform
- a temporal pattern detector for engineering workflows

Iris evaluates systems, not people.

---

## Analytical Capabilities

### Delivery Durability
- **Stabilization ratio** — % of files that persist without re-modification
- **Churn detection** — files modified repeatedly within a short window
- **Revert detection** — commits that undo previous work
- **Code durability** — line survival rate via git blame, by origin
- **New code churn rate** — % of newly added code re-modified within 2 and 4 weeks, by origin

### AI Impact Analysis
- **Origin classification** — attribute commits to Human, AI-Assisted (by tool), or Bot
- **Correction cascades** — detect fix-following patterns by origin
- **Acceptance rate** — code review survival by origin and AI tool
- **Origin funnel** — track code from commit through review to survival
- **Attribution gap** — flag unattributed high-velocity commits

### Code Quality Intelligence
- **Duplicate block detection** — identify identical code blocks (5+ lines) copied across files within commits
- **Code movement / refactoring health** — detect cross-file code movement and compute refactoring ratio (moved vs duplicated)
- **Code provenance** — measure the age of code being revised via git blame (age bracket distribution)
- **Operation classification** — classify changes into added/deleted/updated/moved/duplicated with dominant operation

### Temporal Intelligence
- **Activity timeline** — weekly breakdown of commits, LOC, intent, origin, and quality
- **Delivery pulse** — visual heatmap of weekly health
- **Pattern detection** — burst-then-fix, quiet periods, AI adoption ramps, intent shifts
- **Trend analysis** — baseline vs recent comparison with attention signals

### Structural Analysis
- **Stability map** — per-directory stabilization and churn
- **Churn investigation** — chains (feat->fix->fix), file coupling, top churning files
- **Commit shape** — structural profile (focused, spread, bulk, surgical) by origin
- **Intent classification** — feature, fix, refactor, config breakdown

### Knowledge Priming
- **Priming detection** — scan repos for CLAUDE.md, .cursor/rules, copilot-instructions
- **Priming correlation** — connect priming doc presence with stabilization metrics

### Infrastructure
- **Diff reader** — parse actual line content from commits via `git show` for code quality analysis
- **prepare-commit-msg hook** — non-intrusive AI attribution via env var detection
- **Org-level analysis** — cross-repo intelligence, attention signals, delivery narrative

---

## Guiding Principles

### 1. Measure Systems, Not Individuals

All analysis remains team or organizational in scope. Iris never evaluates individual developer performance.

### 2. Metrics Are Hypotheses

Every metric is a testable hypothesis, not a truth. Thresholds evolve through experimentation. The system documents assumptions explicitly.

### 3. Observable Signals Over Self-Reported Data

The platform relies on verifiable signals: repository history, pull request lifecycle, file modification patterns. No surveys or subjective scoring.

### 4. Explain Why, Not Just What

Flagging destabilization is insufficient. Iris drills into churn chains, file coupling, and temporal patterns to explain the probable cause.

### 5. Attribution Without Accusation

The attribution gap flags patterns, never claims certainty. "This pattern is uncommon for manual development" is acceptable. "This commit was written by AI" is not.

### 6. Insights Before Interfaces

Reports and conclusions are more important than dashboards. Analytical clarity precedes UI complexity.

---

## Product Direction

### Stage 0 — Signal Discovery (Complete)

The analytical engine is built and validated. 30 analysis modules producing actionable insights from Git data alone, tested on 58 repositories with real findings.

### Stage 1 — Attribution & Adoption (Substantially Complete)

- `prepare-commit-msg` attribution hooks with install/uninstall/status CLI
- Environment-variable detection for Claude, Cursor, Windsurf, generic AI agents
- Browser-based OAuth login (`iris login`) and CLI push to the platform
- Co-author policy guidance in `docs/guides/ai-attribution-policy.md`
- Ongoing work: measuring attribution gap closure with real coverage data

### Stage 2 — Intelligence Platform MVP (Current)

- Next.js 16 + React 19 + Supabase multi-tenant platform under `platform/`
- NextAuth.js with email/password + optional Google OAuth + TOTP 2FA
- Ingestion API (`POST /api/ingest`) fed by CLI tokens (`iris_*`)
- Dashboard, per-repo detail, cross-repo comparison, team management, API keys, audit log
- Docker + Caddy deployment, OpenAPI spec, health probes

### Stage 3 — Scale & Enterprise Readiness (Next)

- SSO (SAML) and fine-grained RBAC beyond the current admin/member/viewer roles
- Billing activation and usage-based metering (currently scaffolded, disabled)
- Automated report delivery (email, Slack) and webhooks
- Cross-system correlation (CI/CD, incidents, observability)
- Anonymized cross-organization benchmarking
- Context provider for AI agents (Knowledge Priming feedback loop)

Each stage must be justified by validated insights, not assumptions.

---

## Non-Goals (current)

- Individual productivity scoring, ranking, or surveillance (permanent)
- Real-time monitoring or live-commit alerting
- IDE plugins and vendor-specific AI telemetry (permanent)
- Dashboard sprawl — new views must tie to a validated signal
- Complex platform infrastructure (event buses, distributed queues) while Stage 2 MVP is still consolidating
- Enterprise abstractions (policy engines, SCIM) until Stage 3 is explicitly opened

---

## Long-Term Vision

Software engineering is undergoing a structural transformation driven by AI.

Iris aims to become the system organizations use to understand that transformation — not by counting commits or tracking velocity, but by measuring whether code endures.

The ambition: define a new category.

**Engineering Intelligence for the AI Era.**

---
