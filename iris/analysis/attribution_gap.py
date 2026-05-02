"""Attribution gap — flag unattributed commits with high-velocity patterns.

Detects commits that match patterns consistent with AI-assisted development
but have no AI attribution (no co-author tag). This does NOT infer that
commits are AI — it flags a gap in attribution that merits investigation.

A commit is flagged when it matches 2+ of these signals:
- Burst: 3+ commits by the same author within 2 hours
- High LOC: >100 lines added in a single commit
- Rapid succession: <30 minutes since the same author's previous commit
- Wide spread: 5+ files changed in a single commit

Design principles:
- Never claim a commit is AI — say the pattern is uncommon
- Never attribute to a specific tool
- Never penalize — only suggest better attribution
- Require 2+ signals to flag (single signal is too noisy)
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta

from iris.analysis.origin_classifier import CommitOrigin, classify_origin
from iris.models.commit import Commit


@dataclass(frozen=True)
class AttributionGapResult:
    """Result of attribution gap analysis."""

    flagged_commits: int
    total_human_commits: int
    flagged_pct: float
    avg_loc: float
    avg_files: float
    avg_interval_minutes: float


# Minimum flagged commits to report (avoids noise on small samples).
MIN_FLAGGED_TO_REPORT = 3

# Signal thresholds.
LOC_THRESHOLD = 100         # lines added per commit
FILES_THRESHOLD = 5         # files changed per commit
INTERVAL_MINUTES = 30       # minutes since same author's previous commit
BURST_WINDOW_HOURS = 2      # window for burst detection
BURST_MIN_COMMITS = 3       # minimum commits in burst window

# Minimum signals to flag a commit.
MIN_SIGNALS = 2


def detect_attribution_gap(commits: list[Commit]) -> AttributionGapResult | None:
    """Detect unattributed commits with high-velocity patterns.

    Args:
        commits: All commits sorted by date ascending.

    Returns:
        AttributionGapResult if enough commits are flagged, else None.
    """
    if not commits:
        return None

    # Filter to human-classified, non-merge commits
    human_commits = []
    for commit in commits:
        if commit.is_merge:
            continue
        origin = classify_origin(commit)
        if origin == CommitOrigin.HUMAN:
            human_commits.append(commit)

    if len(human_commits) < MIN_FLAGGED_TO_REPORT:
        return None

    # Group by author for temporal analysis
    by_author: dict[str, list[Commit]] = defaultdict(list)
    for c in human_commits:
        by_author[c.author].append(c)

    # Pre-compute burst membership per author
    burst_hashes = _find_burst_commits(by_author)

    # Score each commit
    flagged: list[Commit] = []
    flagged_intervals: list[float] = []

    for author, author_commits in by_author.items():
        for i, commit in enumerate(author_commits):
            signals = 0

            # Signal 1: high LOC
            loc = sum(fc.lines_added for fc in commit.files)
            if loc > LOC_THRESHOLD:
                signals += 1

            # Signal 2: wide spread (many files)
            if len(commit.files) >= FILES_THRESHOLD:
                signals += 1

            # Signal 3: rapid succession
            interval = None
            if i > 0:
                gap = (commit.date - author_commits[i - 1].date).total_seconds() / 60
                if 0 < gap <= INTERVAL_MINUTES:
                    signals += 1
                    interval = gap

            # Signal 4: part of a burst
            if commit.hash in burst_hashes:
                signals += 1

            if signals >= MIN_SIGNALS:
                flagged.append(commit)
                if interval is not None:
                    flagged_intervals.append(interval)

    if len(flagged) < MIN_FLAGGED_TO_REPORT:
        return None

    # Compute averages
    avg_loc = sum(sum(fc.lines_added for fc in c.files) for c in flagged) / len(flagged)
    avg_files = sum(len(c.files) for c in flagged) / len(flagged)
    avg_interval = (
        sum(flagged_intervals) / len(flagged_intervals)
        if flagged_intervals else 0
    )

    return AttributionGapResult(
        flagged_commits=len(flagged),
        total_human_commits=len(human_commits),
        flagged_pct=round(len(flagged) / len(human_commits), 3),
        avg_loc=round(avg_loc, 0),
        avg_files=round(avg_files, 1),
        avg_interval_minutes=round(avg_interval, 0),
    )


def _find_burst_commits(by_author: dict[str, list[Commit]]) -> set[str]:
    """Find commits that are part of a burst (3+ commits in 2h by same author)."""
    burst_hashes: set[str] = set()
    window = timedelta(hours=BURST_WINDOW_HOURS)

    for author, author_commits in by_author.items():
        if len(author_commits) < BURST_MIN_COMMITS:
            continue

        for i, commit in enumerate(author_commits):
            # Count commits in [commit.date, commit.date + window]
            burst = [commit]
            for j in range(i + 1, len(author_commits)):
                if author_commits[j].date - commit.date <= window:
                    burst.append(author_commits[j])
                else:
                    break

            if len(burst) >= BURST_MIN_COMMITS:
                for c in burst:
                    burst_hashes.add(c.hash)

    return burst_hashes
