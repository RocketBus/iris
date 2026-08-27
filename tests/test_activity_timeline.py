"""Tests for activity_timeline's weekly origin-distribution sample floor (#189).

A week's origin_distribution (which drives weekly AI-adoption %) previously
had no minimum commit count, unlike stabilization_ratio — a single AI-tagged
commit in an otherwise quiet week could swing that week to 100% AI adoption,
a statistically meaningless spike that leaked into the org timeline chart as
visible noise.

Runnable as: `python -m pytest tests/test_activity_timeline.py -v`
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.activity_timeline import (
    MIN_COMMITS_FOR_RATIO,
    calculate_activity_timeline,
)
from iris.models.commit import Commit


def _commit(day: int, attribution_trailers: list[str] | None = None) -> Commit:
    return Commit(
        hash=f"h{day}",
        author="Alice",
        date=datetime(2026, 1, day, tzinfo=timezone.utc),
        attribution_trailers=attribution_trailers or [],
    )


def test_week_below_min_commits_has_empty_origin_distribution():
    # Week A (Jan 1): a single AI-tagged commit — below MIN_COMMITS_FOR_RATIO.
    # Week B (Jan 15-17): three human commits — a two-week gap safely clears
    # any ISO-week-boundary ambiguity between the two groups.
    commits = [
        _commit(1, attribution_trailers=["copilot@users.noreply.github.com"]),
        _commit(15),
        _commit(16),
        _commit(17),
    ]
    result = calculate_activity_timeline(commits, churn_days=14)
    assert result is not None

    week_a = next(w for w in result.weeks if w.commits == 1)
    assert week_a.origin_distribution == {}
    assert week_a.stabilization_ratio is None


def test_week_at_min_commits_has_populated_origin_distribution():
    commits = [
        _commit(1, attribution_trailers=["copilot@users.noreply.github.com"]),
        _commit(2),
        _commit(3),
        _commit(15),
    ]
    assert len([c for c in commits if c.date.day <= 3]) == MIN_COMMITS_FOR_RATIO

    result = calculate_activity_timeline(commits, churn_days=14)
    assert result is not None

    week_a = next(w for w in result.weeks if w.commits == MIN_COMMITS_FOR_RATIO)
    assert sum(week_a.origin_distribution.values()) == MIN_COMMITS_FOR_RATIO
    assert week_a.origin_distribution.get("AI_ASSISTED") == 1


if __name__ == "__main__":
    tests = [fn for name, fn in globals().items() if name.startswith("test_")]
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"ok  {fn.__name__}")
        except AssertionError:
            failed += 1
            print(f"FAIL {fn.__name__}")
    if failed:
        print(f"\n{failed} failure(s)")
        sys.exit(1)
    print(f"\n{len(tests)} tests passed")
