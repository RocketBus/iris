# Iris — Engineering Intelligence for the AI Era

## The Problem

Your team adopted AI coding tools. Commits increased. PRs are faster. But you can't answer:

**Is the code actually better — or just more?**

Traditional metrics (velocity, throughput, cycle time) were designed for human-only teams. When AI generates code, more activity can mean more instability. You need a system that measures what matters: **does the code endure?**

---

## What Iris Does

Iris analyzes your Git repositories and answers:

| Question | How Iris Answers |
|---|---|
| Is AI code durable? | Line survival rate by origin (Human vs AI) via git blame |
| Where is the codebase unstable? | Stability map by directory + top churning files |
| What caused destabilization? | Churn chains (feat->fix->fix), file coupling, temporal patterns |
| Are AI tools being used but invisible? | Attribution gap detection (high-velocity unattributed commits) |
| Is code being copied or reused? | Duplicate block detection + refactoring ratio (moved vs duplicated) |
| How quickly does new code break? | New code churn rate at 2-week and 4-week windows, by origin |
| Is effort improving old code or fixing new code? | Code provenance — age distribution of revised code via git blame |
| How does code survive review? | Acceptance rate by origin and AI tool |
| What's the delivery health over time? | Weekly timeline with delivery pulse heatmap |

**No agents to install. No CI changes.** Point it at a Git repo and get a Markdown report — or push results to the Iris platform for a multi-repo dashboard.

---

## Proven Results

Validated on a real organization (58 repos, 3,497 commits, 1,211 PRs) across 30 analysis modules:

- AI-assisted code stabilizes at **79%** vs **64%** for human code
- **45%** of "human" commits match high-velocity patterns — likely unattributed AI
- Found **4 client implementations with 100% coupling** causing cascading changes
- Weekly timeline explained a **54-commit burst** that destabilized an entire module

---

## How It Works

```bash
# Single repo
iris /path/to/repo

# Entire organization
iris --org /path/to/org-directory --trend

# Install AI attribution hook
iris hook install /path/to/repo

# Log in and push metrics to the Iris platform
iris login
iris /path/to/repo --push
```

**CLI requirements:** Python 3.11+, Git. Optional: GitHub CLI for PR data, OpenTelemetry extras for tracing.

**Platform (optional):** Multi-tenant Next.js + Supabase app under `platform/` that ingests CLI metrics and renders a dashboard across repos, teams, and time.

**Output:** Markdown report + JSON metrics on disk, plus remote storage and a web UI when you push.

---

## Who It's For

- **Engineering leaders** who need to understand AI's impact on delivery quality
- **Platform teams** evaluating which AI tools produce the most durable code
- **FinOps / compliance** preparing for EU AI Act requirements (August 2026)

---

## What It's Not

- Not a developer surveillance tool — analyzes systems, never individuals
- Not a real-time dashboard — generates point-in-time reports
- Not an IDE plugin — works from Git history alone
- Not a productivity tracker — measures durability, not speed

---

## Current Status

**Stage 2 — Intelligence Platform MVP (current).** Engine (30 analysis modules) and attribution hooks are complete and validated. A multi-tenant Next.js + Supabase platform ingests CLI metrics and renders per-repo, per-team, and cross-repo views. Next: Stage 3 — SSO, fine-grained RBAC, billing activation, automated delivery, and cross-system correlation.

---

**RocketBus/clickbus-iris** | Apache 2.0 License
