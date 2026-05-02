# Iris — Methodology

> For the field-level reference (every metric name, its unit, how it's
> computed, and when it's null), see **[METRICS.md](METRICS.md)**. This
> document explains the *why*.

## How We Measure Software Delivery

Traditional engineering metrics were built for a world where humans wrote all the code. Velocity, throughput, and cycle time tell you how much happened — but not whether it mattered.

Iris measures whether code **endures**.

We analyze Git history to separate **signal** (changes that persist and stabilize) from **noise** (changes that require correction, rework, or rapid re-editing). This ratio — what we call Engineering Signal vs Noise — is the foundation of every metric we produce.

---

## Stabilization

**What it measures:** Whether changes persist after being introduced.

When a developer (or an AI assistant) modifies a file, that change either settles into the codebase or gets quickly revised. We track the lifecycle of file modifications across a configurable time window. If a file remains untouched after its last change, it has **stabilized**. If it keeps being modified in quick succession, it hasn't.

The **stabilization ratio** is the proportion of touched files that reached a stable state. A high ratio means the team is shipping durable work. A low ratio means a significant part of the effort is being spent correcting previous changes.

This matters because AI tools can dramatically increase the volume of code produced. More output is only valuable if it sticks.

**What it does NOT measure:** Code correctness. A stabilized file is not necessarily a good file — it simply wasn't re-modified. Stabilization is a proxy for delivery confidence, not quality assurance.

---

## Code Durability

**What it measures:** Whether the lines of code introduced by a change survive over time.

Stabilization tells you if a file stopped being edited. Durability goes deeper: it checks whether the actual lines written in that file are still present at the current state of the codebase.

We attribute surviving lines to their origin — human-written or AI-assisted — to understand which source produces code that endures longer. The **survival rate** expresses what percentage of introduced lines are still present. The **median age** tells you how long those lines have been in the codebase.

Together, stabilization and durability answer complementary questions:
- **Stabilization:** Did the file settle?
- **Durability:** Did the code inside it last?

A file can stabilize quickly but contain code that gets replaced months later during a refactor. Durability captures that longer-term dimension.

---

## Churn

**What it measures:** Repeated modification of the same files within a short time window.

Churn is the inverse signal of stabilization. When a file is touched multiple times in rapid succession, it suggests the initial change was incomplete, incorrect, or poorly understood. We call these **churn events**.

Churn is not inherently bad — exploratory work, prototyping, and iterative design naturally produce churn. But persistent churn in production code is a strong indicator of instability.

Iris goes beyond counting churn events. We investigate the **structure** of churn:

- **Churn chains** reveal the intent sequence behind repeated modifications. A chain like `feature → fix → fix → fix` tells a different story than `refactor → refactor`.
- **File coupling** identifies files that consistently change together. When two files always require simultaneous modification, it points to architectural dependencies that increase the cost of every change.

Churn analysis explains *why* parts of the codebase are unstable, not just *that* they are.

---

## Intent Classification

**What it measures:** The purpose behind each change.

Not all commits are equal. A feature introduction, a bug fix, a refactor, and a configuration change carry different expectations about stability and risk. Iris classifies every commit by its **intent** — deterministically, from observable signals in the commit itself.

This classification unlocks a critical dimension: metrics segmented by intent. When stabilization drops, knowing that it dropped specifically for **fix** commits (while feature commits remain stable) tells a fundamentally different story than a flat aggregate number.

Intent classification also reveals the team's engineering behavior profile. A repository where 60% of commits are fixes tells you something different from one where 60% are features. Neither is inherently better — but the pattern matters for understanding delivery health.

---

## Origin Attribution

**What it measures:** Whether a change was produced by a human, an AI assistant, or a bot.

AI is changing how code is written, but most organizations have no visibility into where AI is actually being used. Iris attributes commits to their origin based on observable markers — co-author metadata, authorship patterns, and tool-specific traces.

Every metric in Iris can be segmented by origin. This allows direct comparison: Do AI-assisted changes stabilize at the same rate as human changes? Do they produce more churn? Do they survive code review at the same rate?

Origin attribution also reveals the **attribution gap** — commits that exhibit high-velocity patterns consistent with AI assistance but carry no explicit attribution. This gap is significant: in our validation data, 45% of apparently "human" commits matched AI-assisted patterns.

Understanding origin is not about judgment. It's about knowing where AI is contributing so organizations can make informed decisions about tooling, training, and process.

---

## Correction Cascades

**What it measures:** Whether a change triggers follow-up fixes on the same files.

A cascade occurs when a commit is followed by one or more fix commits touching the same files shortly after. This pattern indicates that the original change was incomplete or introduced issues that required immediate correction.

The **cascade rate** measures how frequently this happens. The **cascade depth** measures how many corrective commits follow before the code stabilizes.

Cascades are a stronger instability signal than simple churn. Churn tells you a file is being modified repeatedly. Cascades tell you the modifications are **reactive** — fixes responding to a previous change, not independent improvements.

When segmented by origin, cascades reveal whether AI-assisted or human changes are more likely to trigger corrective work. In well-primed repositories (those with explicit AI context files), cascade rates approach zero — suggesting that context quality directly influences code quality.

---

## Duplicate Code Detection

**What it measures:** Whether commits introduce identical code blocks across multiple files.

When the same block of 5 or more contiguous, non-trivial lines appears in different files within the same commit, it indicates copy-paste development rather than code reuse. Iris scans commit diffs to detect these patterns.

The **duplicate block rate** is the percentage of commits containing at least one duplicated block. The **median block size** shows how large these repeated fragments are.

This metric is directly informed by GitClear's 2025 research on 211 million lines of code, which found an 8x increase in duplicate code blocks between 2022 and 2024 — a period that coincides with the widespread adoption of AI coding assistants. Limited context windows in AI tools mean they often generate code that already exists elsewhere in the codebase, because they cannot "see" enough of the project to reuse existing implementations.

When segmented by origin, duplicate detection reveals whether AI-assisted commits produce more duplication than human commits. High duplication is a leading indicator of future maintenance burden: every duplicated block is a consistency liability that must be updated in multiple locations when behavior changes.

**What it does NOT measure:** Intentional duplication. Some code patterns (test fixtures, protocol implementations, boilerplate) are legitimately repeated. Iris filters trivial lines (braces, keywords, whitespace) but does not assess whether duplication is justified.

---

## Code Movement & Refactoring Health

**What it measures:** Whether developers are consolidating code through refactoring.

When lines are deleted from one file and appear as additions in another file within the same commit, it signals code movement — the signature of refactoring. A developer extracting a shared function, reorganizing a module, or consolidating duplicated logic produces this pattern.

The **moved code percentage** tracks what fraction of changed lines represent cross-file movement. The **refactoring ratio** — moved lines divided by (moved + duplicated) lines — measures whether the codebase is trending toward consolidation or fragmentation.

GitClear's research found that moved code collapsed from 24% of all code operations in 2020 to just 9.5% in 2024, while copy-paste operations surpassed movement for the first time. This inversion suggests that AI-assisted development favors generating new code over reorganizing existing code.

A healthy codebase maintains a balance between creation and consolidation. When duplication grows and movement declines, the codebase expands without the structural improvement needed to keep it maintainable.

---

## Code Provenance

**What it measures:** The age of code being revised.

Not all code changes are equal. Modifying code that was written two years ago is fundamentally different from modifying code that was written two days ago. The first suggests a planned improvement to established logic. The second suggests the original implementation was incomplete.

Iris uses `git blame` on the parent state of modified files to determine when the lines being changed were originally introduced. These ages are grouped into brackets — from less than two weeks to more than two years — to reveal the **age distribution of revised code**.

The **pct_revising_new_code** metric (revisions on code less than one month old) is particularly significant. GitClear's research found this figure rose from 70% in 2020 to 79.2% in 2024. When the vast majority of engineering effort goes toward correcting recently-written code rather than improving mature code, it suggests a pattern of incomplete initial implementation.

When segmented by origin, provenance analysis reveals whether AI-assisted code gets reworked sooner than human-authored code — a direct measure of first-attempt quality.

---

## New Code Churn Rate

**What it measures:** How quickly newly introduced code requires revision.

Standard churn measures whether files are modified repeatedly. New code churn is more specific: it tracks files that received new code additions and checks whether those same files are modified again within two weeks or four weeks.

This distinction matters because high general churn can result from healthy iteration on mature code. High *new code* churn specifically indicates that recently-written code was insufficient on first delivery.

GitClear's research found a 20-25% increase in new code churn rates between 2021 (pre-AI baseline) and 2024. Iris segments this metric by origin to answer: **Does AI-authored code need more correction than human-authored code?**

The two-week window captures urgent rework (code that fails immediately). The four-week window captures delayed rework (issues discovered through testing or production observation). Together, they provide a temporal profile of code reliability at the point of creation.

---

## Operation Classification

**What it measures:** The composition of code changes across five operation types.

Inspired by GitClear's taxonomy of code change operations, Iris classifies each commit's changes into five categories:

- **Added** — net new lines with no corresponding deletion (new code)
- **Deleted** — net removed lines with no corresponding addition
- **Updated** — lines modified in place (both added and removed in the same file)
- **Moved** — lines deleted from one file and added to another (refactoring)
- **Duplicated** — identical blocks appearing across multiple files

The **operation distribution** shows what percentage of all changes fall into each category. The **dominant operation** identifies the primary activity type.

This classification transforms raw line counts into a meaningful activity profile. A repository where 80% of operations are "added" with minimal "moved" is expanding without consolidation. One with balanced "added" and "moved" is growing while maintaining structural health.

When tracked over time and segmented by origin, the operation mix reveals how AI tools change the nature of development — not just the volume, but the character of the work being done.

---

## Delivery Velocity

**What it measures:** The pace of delivery and its relationship with code quality.

Iris tracks commits per week and lines changed per week across configurable time windows. But raw velocity is not the point — the relationship between velocity and durability is.

A team that ships 50 commits per week with 90% stabilization is in a different situation than a team shipping 50 commits per week with 40% stabilization. The first team is accelerating. The second is spinning.

Iris computes whether velocity is **accelerating**, **stable**, or **decelerating** by comparing recent activity against baseline periods. It correlates velocity changes with durability changes to surface the question every engineering leader needs answered: **Are we going faster and getting better, or going faster and getting worse?**

Velocity without durability context is a vanity metric. Iris ensures they are always read together.

---

## How These Metrics Relate

These metrics form a layered system:

```
Stabilization       →   Did the change settle?
Durability          →   Did the code survive?
Churn               →   What patterns indicate instability?
New Code Churn      →   Was the initial implementation sufficient?
Intent              →   What was the purpose of the change?
Origin              →   Who (or what) produced it?
Cascades            →   Did it trigger corrective work?
Duplicates          →   Is code being copied instead of reused?
Code Movement       →   Is refactoring keeping pace with growth?
Provenance          →   Is effort improving mature code or fixing recent code?
Operations          →   What kind of work is the team actually doing?
Velocity            →   Is the pace sustainable?
```

Stabilization is the fast signal — it can be computed within days of a change. Durability is the slow signal — it reveals itself over weeks or months. Churn is the diagnostic signal — it explains the probable cause when stabilization or durability are low. New code churn isolates the question to first-attempt quality: is fresh code breaking faster? Intent and origin are the segmentation axes — they turn flat numbers into comparative insights. Cascades are the quality signal — they reveal whether changes hold up under real use. Duplicates and code movement are the structural health signals — they reveal whether the codebase is growing with discipline or expanding through repetition. Provenance is the maturity signal — it shows whether engineering effort is invested in improving established code or perpetually patching recent work. Operation classification is the activity profile — it transforms raw line counts into a characterization of what kind of work is being done. Velocity is the context signal — it determines whether the team is accelerating sustainably or accumulating hidden debt.

An engineering leader reading a Iris report can follow this chain:
1. The stabilization ratio dropped this month → something changed
2. Intent segmentation shows fix commits doubled while feature commits stayed flat → the team is in correction mode
3. Origin attribution shows AI-assisted changes are stabilizing at 79%, human changes at 64% → the instability isn't from AI
4. Cascade analysis reveals that a specific set of human commits triggered 3-deep fix chains → the root cause is localized
5. Churn investigation reveals a coupling pattern between four service clients → every feature change cascades across all four
6. Duplicate detection shows 15% of AI-assisted commits contain copy-pasted blocks → AI tools are generating redundant code
7. Code movement is at 3%, down from 12% last quarter → refactoring has stalled as the team relies on AI generation
8. Provenance shows 82% of revisions target code less than a month old → the team is constantly reworking recent output
9. New code churn at 2 weeks is 40% for AI-assisted code vs 20% for human code → AI-generated code breaks twice as fast
10. The operation mix is 85% "added" with negligible "moved" → the codebase is expanding without consolidation
11. Velocity is accelerating, but durability is declining → the team is going faster and getting worse

The insight is architectural, not individual. The recommendation is systemic, not personal.

---

## Design Principles Behind the Metrics

**Hypotheses, not truths.** Every metric is a model. Models are refined through observation. The thresholds and parameters used internally are living values that evolve as we analyze more repositories.

**Systems, not individuals.** All metrics operate at the file, directory, repository, or organization level. Iris never evaluates individual developer performance.

**Observable signals only.** We rely exclusively on data available in Git history and pull request metadata. No surveys, no self-reporting, no IDE telemetry.

**Explainable by design.** If we cannot explain a metric in plain language to an engineering leader, the metric should not exist.

---

## What We Don't Disclose

The specific algorithms, thresholds, time windows, and heuristics used to compute these metrics are part of the Iris analytical engine and are not documented publicly. This document describes *what* we measure and *why* — the *how* is proprietary.

We believe transparency about methodology builds trust. Transparency about implementation details is not required for that trust.

---
