# Iris Engineering Impact Report

**Repository:** acme/order-platform
**Analysis window:** 90 days
**Churn window:** 14 days

> *Engineering outcomes emerge from system dynamics, domain complexity, and organizational context. Metrics describe observable patterns and should not be interpreted as evaluation of teams or individuals.*

---

## Key Findings

- Stabilization ratio is 39% — 61% of modified files were changed again within the churn window. This may indicate significant corrective effort. This may reflect domain complexity, evolving requirements, or subsystems under active development.
- Revert rate is 0.6% (1 of 161 commits), within a healthy range.
- 105 files showed churn (61% of files touched), affecting 21,752 lines. High churn may indicate that changes are not stabilizing. This may reflect iterative development, evolving requirements, or areas of the system under active learning.
- 161 commits analyzed across 171 unique files.
- Feature commits dominate at 57%, suggesting the primary engineering activity is new capability development. This may indicate an expansion phase or investment in new capabilities.
- Fix-related changes show 10 churn events, comparable to feature churn (65 events).
- Stabilization varies by intent: Unknown at 100% vs Fix at 52%. Different change types naturally stabilize at different rates depending on domain complexity and feedback loops.
- 34 PRs merged in this period with a median time to merge of 36.8 hours.
- 94% of PRs were merged without any change requests (single-pass rate), suggesting efficient review cycles.
- PR merge time increased by 63h recently. This may reflect larger PRs, more thorough review, or integration complexity.
- Config share shifted by 5pp (down) in the recent window. This indicates a change in the dominant type of engineering activity.

---

## Metric Details

### Revert Rate: 0.6%

1 of 161 commits in this period were identified as reverts (commits that undo previous work). Revert rate is a proxy for instability — it measures how often changes need to be completely rolled back. Detection is based on commit message patterns and may not capture all manual reverts.

### Churn Events: 105

A churn event occurs when a file is modified multiple times within the churn window. 105 files were repeatedly modified, involving 21,752 total lines changed. High churn can indicate corrective effort — code being fixed or rewritten shortly after initial delivery.

### Stabilization Ratio: 38.6%

66 of 171 files were not modified again within the churn window after their last change. This is the core signal/noise indicator: a high ratio means changes persist (delivery signal), a low ratio means changes are frequently rewritten (engineering noise).

### Engineering Behavior: 161 commits

Commits were classified by intent: 91 Feature, 24 Fix, 10 Refactor, 33 Config, 3 Unknown. This breakdown reveals the dominant type of engineering activity — whether the team is building, fixing, or restructuring.

### Stability by Intent: 

Stabilization ratio per change type: Feature 58%, Fix 52%, Refactor 62%. Comparing stability across intents reveals which types of changes produce durable outcomes and which require further iteration.

### Median Time to Merge: 36.8h

The median pull request took 36.8 hours from open to merge, across 34 merged PRs. This measures the feedback loop speed — shorter times may indicate smoother review cycles or smaller PRs.

### Single-Pass Rate: 94%

94% of PRs were merged without any CHANGES_REQUESTED review. The median PR went through 0.0 review rounds. A high single-pass rate may indicate that code is well-prepared before review, potentially aided by AI-assisted development.

---

## Metrics Summary

| Metric | Value |
|---|---|
| Commits (total) | 161 |
| Commits (reverts) | 1 |
| Revert rate | 0.6% |
| Churn events | 105 |
| Churn lines affected | 21752 |
| Files touched | 171 |
| Files stabilized | 66 |
| Stabilization ratio | 38.6% |

## Engineering Behavior Overview

| Intent | Commits | % | Lines Changed |
|---|---|---|---|
| Feature | 91 | 57% | 22,164 |
| Fix | 24 | 15% | 555 |
| Refactor | 10 | 6% | 3,348 |
| Config | 33 | 20% | 274 |
| Unknown | 3 | 2% | 587 |

## Stability by Change Type

| Intent | Files | Stabilization | Churn Events |
|---|---|---|---|
| Feature | 156 | 58% | 65 |
| Fix | 21 | 52% | 10 |
| Refactor | 87 | 62% | 33 |
| Config | 9 | 78% | 2 |
| Unknown | 7 | 100% | 0 |

## Commit Shape Analysis

| Origin | Files/commit | Lines/file | Dir. spread | Shape |
|---|---|---|---|---|
| Human | 2 | 15 | 0.50 | surgical |

## Code Durability — Time to Rework

> Median time to rework: 2.0 days.

| Origin | Median Rework | Fast (< 3d) | Events |
|---|---|---|---|
| Human | 2.0 days | 61% | 487 |

## Code Durability — Line Survival

> Lines introduced during this window that still exist at HEAD.

| Origin | Lines Introduced | Lines Surviving | Survival Rate | Median Age |
|---|---|---|---|---|
| Human | 12,192 | 9,761 | 80% | 30 days |

## Correction Cascades

> A correction cascade occurs when a commit is followed by one or more FIX commits touching the same files within 7 days.

- Cascade rate: 30% of commits triggered corrections
- Median cascade depth: 2.0 fixes per cascade

| Origin | Commits | Cascades | Rate | Median Depth |
|---|---|---|---|---|
| Human | 128 | 38 | 30% | 2.0 |

## Churn Investigation

**Top churning files:**

| File | Touches | Lines | Fixes | Chain | Span |
|---|---|---|---|---|---|
| charts/order-platform/values.yaml | 40 | 194 | 4 | config → config → config → config → config → config → config → config | 01/21–03/27 |
| internal/app/application.go | 29 | 738 | 3 | refactor → refactor → feature → feature → feature → refactor → feature → feature | 02/21–03/26 |
| internal/integrations/gateway/client.go | 24 | 1,967 | 0 | feature → feature → feature → feature → feature → feature → feature → feature | 01/16–03/20 |
| charts/order-platform/Chart.yaml | 24 | 96 | 0 | config → config → config → config → config → config → config → config | 01/21–03/27 |
| internal/message/processor.go | 23 | 1,876 | 1 | unknown → feature → feature → feature → feature → feature → refactor → refactor | 01/17–03/26 |
| pkg/config/config.go | 18 | 273 | 0 | feature → unknown → feature → feature → feature → feature → feature → feature | 01/16–03/25 |
| charts/order-platform/environments/eu/values.yaml | 18 | 171 | 4 | feature → fix → config → feature → feature → feature → fix → fix | 03/02–03/25 |
| internal/message/messages.go | 17 | 530 | 3 | feature → feature → feature → feature → feature → fix → fix → feature | 02/13–03/26 |
| go.sum | 15 | 733 | 0 | feature → feature → feature → feature → refactor → config → feature → feature | 01/16–03/26 |
| go.mod | 15 | 280 | 0 | feature → feature → feature → feature → refactor → config → feature → feature | 01/16–03/26 |

**File coupling** (files that change together):

| File A | File B | Co-occurrences | Coupling |
|---|---|---|---|
| charts/order-platform/Chart.yaml | charts/order-platform/values.yaml | 24 | 100% |
| go.mod | go.sum | 15 | 100% |
| charts/order-platform/environments/prod/values.yaml | charts/order-platform/environments/stg/values.yaml | 8 | 100% |
| charts/order-platform/environments/prod/values.yaml | charts/order-platform/values.yaml | 8 | 100% |
| internal/chatbot/bot.go | internal/message/processor.go | 6 | 100% |
| internal/common/interfaces/flow.go | internal/common/interfaces/service.go | 6 | 100% |
| docker-compose.dev.yml | env.example | 5 | 100% |
| internal/integrations/cli/client.go | internal/integrations/gateway/client.go | 5 | 100% |
| internal/integrations/cli/client.go | internal/integrations/telco/client.go | 5 | 100% |
| internal/integrations/cli/client.go | internal/integrations/direct/client.go | 5 | 100% |

## Stability Map

| Directory | Files | Stabilized | Ratio | Churn |
|---|---|---|---|---|
| internal/handlers | 3 | 0 | 0% | 3 |
| internal/orders | 3 | 0 | 0% | 3 |
| internal/message | 16 | 2 | 12% | 14 |
| charts/order-platform | 7 | 1 | 14% | 6 |
| internal/integrations | 45 | 7 | 16% | 38 |
| internal/app | 3 | 1 | 33% | 2 |
| internal/payments | 3 | 1 | 33% | 2 |
| internal/gds | 4 | 2 | 50% | 2 |
| internal/session | 4 | 2 | 50% | 2 |
| pkg/experimental | 4 | 2 | 50% | 2 |
| internal/common | 23 | 13 | 56% | 10 |
| .github/workflows | 3 | 2 | 67% | 1 |
| pkg/tracing | 3 | 2 | 67% | 1 |
| prompts | 3 | 2 | 67% | 1 |
| docs | 4 | 3 | 75% | 1 |
| docs/flows | 7 | 7 | 100% | 0 |
| pkg/metrics | 3 | 3 | 100% | 0 |

## Code Review Acceptance Rate

> Measures how commits survive the code review process, segmented by origin and AI tool.

| Origin | Commits | In PRs | PR Rate | Single-Pass | Review Rounds |
|---|---|---|---|---|---|
| Human | 161 | 0 | 0% | 0% | 0.0 |

## PR Lifecycle

| Metric | Value |
|---|---|
| PRs merged | 34 |
| Median time to merge (hours) | 36.8 |
| Median PR size (files) | 13 |
| Median PR size (lines) | 679 |
| Median review rounds | 0.0 |
| Single-pass rate | 94% |

## Delivery Velocity

> Commit velocity: 16.1 commits/week, 2698.9 lines/week.
> Velocity trend: accelerating (+132% over period).
> Velocity-durability correlation: negative — faster delivery is associated with less stable code.

| Window | Commits/wk | Stabilization | Churn |
|---|---|---|---|
| 01/16 | 4.0 | 67% | 33% |
| 01/30 | 14.0 | 45% | 55% |
| 02/13 | 9.0 | 54% | 46% |
| 02/27 | 31.5 | 75% | 25% |
| 03/13 | 22.0 | 100% | 0% |

*Correlation does not imply causation. External factors may independently affect both velocity and stability.*

## Activity Timeline

🟩       ⬜       🟩       🟨       🟩       🟨       🟩       🟨🟨🟨🟨 🟩       🟨       🟥🟥    
01/12    01/19    01/26    02/02    02/09    02/16    02/23    03/02    03/09    03/16    03/23   

🟩 Stable (≥70%)  🟨 Moderate (50-70%)  🟥 Volatile (<50%)  ⬜ Insufficient data

| Week | Commits | LOC | Feature | Fix | AI% | Stab. | Churn |
|---|---|---|---|---|---|---|---|
| 01-12 | 5 | 1,609 | 20% | 40% | 0% | 79% | 4 |
| 01-19 | 1 | 6 | 0% | 0% | 0% | — | 0 |
| 01-26 | 5 | 136 | 20% | 40% | 0% | 70% | 3 |
| 02-02 | 15 | 2,187 | 53% | 0% | 0% | 61% | 7 |
| 02-09 | 12 | 1,913 | 58% | 0% | 0% | 79% | 6 |
| 02-16 | 11 | 3,778 | 64% | 9% | 0% | 58% | 10 |
| 02-23 | 5 | 585 | 40% | 40% | 0% | 79% | 10 |
| 03-02 | 54 | 11,038 | 69% | 19% | 0% | 59% | 45 |
| 03-09 | 12 | 2,827 | 75% | 0% | 0% | 74% | 22 |
| 03-16 | 17 | 1,456 | 71% | 0% | 0% | 61% | 12 |
| 03-23 | 24 | 1,393 | 29% | 29% | 0% | 39% | 17 |

- **Quiet Period** (01/19): Only 1 commits (avg 15/week).
- **Intent Shift** (02/02): Fix share shifted down 40pp (40% -> 0%).
- **Intent Shift** (02/16): Config share shifted down 42pp (42% -> 0%).
- **Intent Shift** (02/23): Fix share shifted up 31pp (9% -> 40%).
- **Intent Shift** (03/02): Feature share shifted up 29pp (40% -> 69%).
- **Intent Shift** (03/23): Feature share shifted down 41pp (71% -> 29%).

## Trend Analysis (last 30 days vs 90-day baseline)

> PR lifecycle shows increased friction: merge time +63.0h.

| Metric | Baseline | Recent | Delta | Signal |
|---|---|---|---|---|
| Stabilization | 38.6% | 41.7% | +3.1pp | — Stable |
| Churn rate | 61.4% | 58.3% | -3.1pp | — Stable |
| Revert rate | 0.6% | 0.9% | +0.3pp | — Stable |
| Feature share | 56.5% | 60.4% | +3.8pp | — Stable |
| Fix share | 14.9% | 17.1% | +2.2pp | — Stable |
| Config share | 20.5% | 15.3% | -5.2pp | ▼ Notable |
| Feature stabilization | 58.3% | 57.0% | -1.3pp | — Stable |
| Fix stabilization | 52.4% | 55.6% | +3.2pp | — Stable |
| PR time to merge | 36.8h | 99.8h | +63.0h | ▲ Significant |
| PR single-pass rate | 94.0% | 93.0% | -1.0pp | — Stable |

---

*Report generated by Iris v0.4b. Metrics are experimental and should be treated as hypotheses, not conclusions.*
