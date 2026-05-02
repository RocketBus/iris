"""Adoption timeline detector — find when AI-assisted development began.

Detects the inflection point where AI-assisted commits started appearing
in a repository and splits commits into pre/post-adoption periods.

Heuristics:
- First AI_ASSISTED commit = adoption ramp start
- First 30-day window with 3+ AI commits = adoption ramp end (established)
- < 5 total AI commits = insufficient confidence
- 5+ AI commits but no 30-day window with 3+ = sparse confidence

The detector reuses origin_classifier for commit attribution.
"""

# AGGREGATOR_OPT_OUT: runs post-hoc because it splits commits and re-aggregates pre/post subsets.
# Consumers: iris/cli.py (Step 5b)

from datetime import timedelta

from iris.analysis.origin_classifier import CommitOrigin, classify_origin
from iris.models.adoption import AdoptionEvent
from iris.models.commit import Commit

# Minimum AI commits required to attempt adoption analysis.
MIN_AI_COMMITS = 5

# Minimum commits in pre-adoption period to produce a meaningful comparison.
MIN_PRE_COMMITS = 5

# Sliding window size for detecting established adoption.
RAMP_WINDOW_DAYS = 30

# Minimum AI commits within the ramp window to declare "clear" adoption.
RAMP_THRESHOLD = 3


def detect_adoption(
    commits: list[Commit],
) -> tuple[AdoptionEvent | None, list[Commit], list[Commit]]:
    """Detect the AI adoption inflection point and split commits.

    Args:
        commits: All commits sorted by date ascending.

    Returns:
        (event, pre_commits, post_commits).
        event is None when no AI commits exist.
        pre/post lists are empty when data is insufficient for comparison.
    """
    # Classify all commits by origin
    classified = [(c, classify_origin(c)) for c in commits]

    # Filter AI-assisted commits, sorted by date
    ai_commits = [
        c for c, origin in classified if origin == CommitOrigin.AI_ASSISTED
    ]

    if not ai_commits:
        return None, [], []

    total_ai = len(ai_commits)
    first_ai = ai_commits[0]

    # Insufficient data — too few AI commits
    if total_ai < MIN_AI_COMMITS:
        event = AdoptionEvent(
            first_ai_commit_date=first_ai.date,
            adoption_ramp_start=first_ai.date,
            adoption_ramp_end=None,
            adoption_confidence="insufficient",
            total_ai_commits=total_ai,
        )
        return event, [], []

    # Find ramp end: first 30-day window with RAMP_THRESHOLD+ AI commits
    ramp_end = _find_ramp_end(ai_commits)

    if ramp_end is not None:
        confidence = "clear"
    else:
        confidence = "sparse"

    event = AdoptionEvent(
        first_ai_commit_date=first_ai.date,
        adoption_ramp_start=first_ai.date,
        adoption_ramp_end=ramp_end,
        adoption_confidence=confidence,
        total_ai_commits=total_ai,
    )

    # Split commits: pre = before ramp start, post = after ramp start
    # (for sparse, we use ramp_start as the split point)
    split_date = first_ai.date
    pre_commits = [c for c in commits if c.date < split_date]
    post_commits = [c for c in commits if c.date >= split_date]

    # Not enough pre-adoption data for meaningful comparison
    if len(pre_commits) < MIN_PRE_COMMITS:
        return event, [], []

    return event, pre_commits, post_commits


def _find_ramp_end(ai_commits: list[Commit]) -> "datetime | None":
    """Find the date when AI adoption becomes established.

    Uses a sliding window: scans for the first 30-day window containing
    RAMP_THRESHOLD or more AI commits. Returns the date of the last commit
    in that window, or None if no such window exists.
    """
    dates = [c.date for c in ai_commits]
    window = timedelta(days=RAMP_WINDOW_DAYS)

    for i, start_date in enumerate(dates):
        window_end = start_date + window
        # Count commits in [start_date, start_date + 30d]
        count = sum(1 for d in dates[i:] if d <= window_end)
        if count >= RAMP_THRESHOLD:
            # Ramp end = last AI commit in this window
            last_in_window = max(d for d in dates[i:] if d <= window_end)
            return last_in_window

    return None
