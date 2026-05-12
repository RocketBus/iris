"""Tests for github_reader state parsing.

Exercises the in-process parsing helpers (no gh subprocess) — verifies
that mixed-state gh JSON output produces PullRequest objects with the
correct state, merged_at, and closed_at fields, and that the window-
overlap filter behaves as documented.

Runnable as: `python -m pytest tests/test_github_reader_state.py -v`
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.ingestion.github_reader import _infer_state, _parse_pull_requests


_NOW = datetime(2026, 5, 1, tzinfo=timezone.utc)
_SINCE = _NOW - timedelta(days=30)


def _raw(
    number: int,
    *,
    created_offset_days: float,
    merged_offset_days: float | None = None,
    closed_offset_days: float | None = None,
    state: str = "OPEN",
) -> dict:
    """Build a gh-style raw PR dict relative to _NOW."""
    def iso(off: float) -> str:
        return (_NOW + timedelta(days=off)).strftime("%Y-%m-%dT%H:%M:%SZ")

    return {
        "number": number,
        "title": f"PR #{number}",
        "createdAt": iso(created_offset_days),
        "mergedAt": iso(merged_offset_days) if merged_offset_days is not None else None,
        "closedAt": iso(closed_offset_days) if closed_offset_days is not None else None,
        "state": state,
        "additions": 0,
        "deletions": 0,
        "changedFiles": 0,
        "author": {"login": "alice"},
        "reviews": [],
        "commits": [],
    }


# ---------------------------------------------------------------------------
# _infer_state
# ---------------------------------------------------------------------------


def test_infer_state_uses_gh_value_when_present():
    assert _infer_state("OPEN", None, None) == "open"
    assert _infer_state("MERGED", _NOW, _NOW) == "merged"
    assert _infer_state("CLOSED", None, _NOW) == "closed"


def test_infer_state_falls_back_to_dates():
    assert _infer_state(None, _NOW, _NOW) == "merged"
    assert _infer_state("", None, _NOW) == "closed"
    assert _infer_state(None, None, None) == "open"


# ---------------------------------------------------------------------------
# _parse_pull_requests
# ---------------------------------------------------------------------------


def test_parse_includes_open_merged_and_closed_states():
    raw = [
        _raw(1, created_offset_days=-10, state="OPEN"),
        _raw(2, created_offset_days=-20, merged_offset_days=-5, state="MERGED"),
        _raw(3, created_offset_days=-15, closed_offset_days=-3, state="CLOSED"),
    ]

    prs = _parse_pull_requests(raw, _SINCE)

    by_number = {p.number: p for p in prs}
    assert by_number[1].state == "open"
    assert by_number[1].merged_at is None
    assert by_number[1].closed_at is None

    assert by_number[2].state == "merged"
    assert by_number[2].merged_at is not None
    assert by_number[2].closed_at is None

    assert by_number[3].state == "closed"
    assert by_number[3].merged_at is None
    assert by_number[3].closed_at is not None


def test_parse_filters_prs_finished_before_window():
    # Merged 60 days ago — before the 30-day window.
    raw_old_merged = _raw(10, created_offset_days=-70, merged_offset_days=-60, state="MERGED")
    # Closed 50 days ago — before the window.
    raw_old_closed = _raw(11, created_offset_days=-80, closed_offset_days=-50, state="CLOSED")
    # Open since 200 days ago — still relevant to a 30-day window.
    raw_long_open = _raw(12, created_offset_days=-200, state="OPEN")
    # Merged 10 days ago — inside window.
    raw_recent_merged = _raw(13, created_offset_days=-20, merged_offset_days=-10, state="MERGED")

    prs = _parse_pull_requests(
        [raw_old_merged, raw_old_closed, raw_long_open, raw_recent_merged],
        _SINCE,
    )

    numbers = {p.number for p in prs}
    assert 10 not in numbers
    assert 11 not in numbers
    assert 12 in numbers
    assert 13 in numbers


def test_parse_dedupes_by_pr_number():
    duplicate = _raw(7, created_offset_days=-10, merged_offset_days=-5, state="MERGED")
    prs = _parse_pull_requests([duplicate, duplicate], _SINCE)
    assert len(prs) == 1
