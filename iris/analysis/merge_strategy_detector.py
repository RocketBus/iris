"""Merge Strategy detection — per-repository classification of how PRs land.

A repository's merge strategy determines how much per-commit signal
survives in history. Squash collapses N commits into 1, discarding commit
counts, temporal distribution, bursts/cascades, and — depending on the
GitHub config — the attribution trailers that AI attribution relies
on. Comparing per-commit metrics across repos that use *different*
strategies compares things that are not comparable, and can under-report AI
adoption in squash repos as if it were low real usage.

This module classifies a repo into one of ``{merge, squash, rebase, mixed,
unknown}`` from its merged PRs, and emits ``commit_metrics_reliable=False``
when the strategy (squash/mixed) erodes per-commit signal.

Privacy / ranking risk
----------------------
Strictly per-repository, by construction. The classification is a property
of repo *configuration* (the merge button), never of people. There is no
author axis anywhere in the output (Principle #2 / Non-Goal: no individual
ranking). The report/UI framing is always "this config affects metric
reliability", never "this team/dev does X".

Signals, in order of confidence
--------------------------------
1. **Ground truth** (when ``merge_commit_parent_count`` is available):
   - parent count ``== 2`` → the PR landed as a true merge commit → MERGE.
2. **Commit-ref presence in the local main history:**
   - *all* of the PR's ``commit_refs`` appear in main → the original
     commits landed verbatim (merge or fast-forward) → MERGE.
   - *none* of the PR's ``commit_refs`` appear in main → the commits were
     collapsed or rewritten:
       * GitHub's squash default stamps the landed commit subject with
         ``(#<pr-number>)`` — a main-branch subject carrying this PR's
         number corroborates SQUASH.
       * else a single original commit → SQUASH (1→1 collapse/rewrite).
       * else multiple original commits, none preserved → REBASE (replayed).
3. Anything ambiguous (partial presence, no commit_refs, no signal) →
   ``unknown`` for that PR; excluded from the dominant computation.

Aggregation
-----------
The dominant strategy over the *classified* merged PRs.
``dominant_share >= DOMINANT_SHARE_THRESHOLD`` → that strategy; below that
→ ``mixed``; fewer than ``MIN_CLASSIFIED_PRS`` classified → ``unknown``
(the reason is carried on the result and logged by the caller, never
invented).

Window / edge cases
-------------------
Uses the same ``commits`` window the rest of the pipeline runs on. A PR
merged near the window's start whose commits predate the window will read
as "refs absent" — the same window limitation Acceptance Rate lives with.
Repo with no merged PRs → ``unknown``. Open/closed-without-merge PRs are
ignored (they never landed).
"""

import re
from collections import defaultdict
from dataclasses import dataclass, field

from iris.models.commit import Commit
from iris.models.pull_request import PullRequest

# Minimum classifiable merged PRs before we trust a dominant strategy.
MIN_CLASSIFIED_PRS = 5

# Share of classified PRs the leading strategy must reach to "own" the repo;
# below it (with a real split) the repo is ``mixed``. Hypothesis pending
# calibration — see Principle #4 (metrics are hypotheses).
DOMINANT_SHARE_THRESHOLD = 0.8

# Strategies that erode per-commit signal — these flip commit_metrics_reliable.
_UNRELIABLE_STRATEGIES = frozenset({"squash", "mixed"})

# GitHub's squash default titles the landed commit "<PR title> (#<number>)".
_SQUASH_SUBJECT_RE = re.compile(r"\(#(\d+)\)\s*$")


@dataclass(frozen=True)
class MergeStrategyResult:
    """Per-repository merge-strategy classification.

    ``distribution`` and ``reason`` are diagnostics (not persisted to the
    metrics schema) — they let the aggregator log *why* a repo came back
    ``unknown`` instead of inventing a strategy.
    """

    merge_strategy: str          # merge | squash | rebase | mixed | unknown
    dominant_share: float | None  # None when unknown
    commit_metrics_reliable: bool
    classified_pr_count: int
    distribution: dict[str, int] = field(default_factory=dict)
    reason: str | None = None


def detect_merge_strategy(
    prs: list[PullRequest],
    commits: list[Commit],
    *,
    min_classified: int = MIN_CLASSIFIED_PRS,
) -> MergeStrategyResult:
    """Classify a repo's dominant merge strategy from its merged PRs.

    Args:
        prs: PRs from github_reader (any state — only merged ones count).
        commits: local main-branch commits from git_reader (the window the
            rest of the pipeline analyses). Used to test whether a PR's
            commit_refs landed verbatim and to read squash subject stamps.
        min_classified: minimum classifiable merged PRs before a dominant
            strategy is trusted; below it the repo is ``unknown``.

    Returns:
        ``MergeStrategyResult`` — always non-None (``unknown`` when there
        isn't enough signal). ``commit_metrics_reliable`` is False only for
        squash/mixed; merge/rebase/unknown stay True (we never flag what we
        can't determine).
    """
    merged = [pr for pr in prs if pr.state == "merged"]
    if not merged:
        return MergeStrategyResult(
            merge_strategy="unknown",
            dominant_share=None,
            commit_metrics_reliable=True,
            classified_pr_count=0,
            distribution={},
            reason="no merged PRs in window",
        )

    main_hashes = {c.hash for c in commits}
    squash_pr_numbers = _squash_pr_numbers(commits)

    distribution: dict[str, int] = defaultdict(int)
    for pr in merged:
        distribution[_classify_pr(pr, main_hashes, squash_pr_numbers)] += 1

    classified = {k: v for k, v in distribution.items() if k != "unknown"}
    classified_count = sum(classified.values())

    if classified_count < min_classified:
        return MergeStrategyResult(
            merge_strategy="unknown",
            dominant_share=None,
            commit_metrics_reliable=True,
            classified_pr_count=classified_count,
            distribution=dict(distribution),
            reason=(
                f"only {classified_count} classifiable merged PRs "
                f"(< {min_classified} required)"
            ),
        )

    dominant = max(classified, key=classified.get)
    dominant_share = round(classified[dominant] / classified_count, 3)
    strategy = dominant if dominant_share >= DOMINANT_SHARE_THRESHOLD else "mixed"

    return MergeStrategyResult(
        merge_strategy=strategy,
        dominant_share=dominant_share,
        commit_metrics_reliable=strategy not in _UNRELIABLE_STRATEGIES,
        classified_pr_count=classified_count,
        distribution=dict(distribution),
        reason=None,
    )


def _classify_pr(
    pr: PullRequest,
    main_hashes: set[str],
    squash_pr_numbers: set[int],
) -> str:
    """Classify a single merged PR. Returns merge/squash/rebase/unknown."""
    # 1. Ground truth: a true merge commit has two parents.
    if pr.merge_commit_parent_count == 2:
        return "merge"

    refs = [r.hash for r in pr.commit_refs]
    present = sum(1 for h in refs if h in main_hashes)

    # 2a. Every commit landed verbatim → merge / fast-forward (signal intact).
    if refs and present == len(refs):
        return "merge"

    squash_corroborated = pr.number in squash_pr_numbers

    # 2b. No original commit survived → collapsed or rewritten.
    if refs and present == 0:
        if squash_corroborated:
            return "squash"
        if len(refs) == 1:
            return "squash"
        return "rebase"

    # 3. No usable commit_refs — lean only on the squash subject stamp.
    if not refs:
        return "squash" if squash_corroborated else "unknown"

    # Partial presence (force-push, shared base, dropped commits) — ambiguous.
    return "unknown"


def _squash_pr_numbers(commits: list[Commit]) -> set[int]:
    """PR numbers stamped on main-branch commit subjects via ``(#N)``.

    GitHub's squash default writes the landed commit subject as
    ``<title> (#<pr-number>)``. Collecting these lets ``_classify_pr``
    corroborate squash even for multi-commit PRs. Subjects without the
    trailing stamp contribute nothing (no false positives from mid-message
    issue references).
    """
    numbers: set[int] = set()
    for commit in commits:
        match = _SQUASH_SUBJECT_RE.search(commit.message)
        if match:
            numbers.add(int(match.group(1)))
    return numbers
