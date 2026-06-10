"""Tests for `iris analyze --windows` parsing (issue #80).

Runnable as: `python -m pytest tests/test_cli_windows.py -v`
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.cli import (
    RECOMMENDED_WINDOWS,
    _infer_window_days,
    _parse_windows,
    _resolve_windows,
)


def test_parses_recommended_set():
    assert _parse_windows("7,15,30,60,90") == [7, 15, 30, 60, 90]


def test_recommended_constant_is_parseable():
    raw = ",".join(str(w) for w in RECOMMENDED_WINDOWS)
    assert _parse_windows(raw) == sorted(RECOMMENDED_WINDOWS)


def test_sorts_and_deduplicates():
    assert _parse_windows("90,7,30,7,90") == [7, 30, 90]


def test_tolerates_whitespace_and_trailing_comma():
    assert _parse_windows(" 7 , 15 ,30, ") == [7, 15, 30]


def test_single_window():
    assert _parse_windows("30") == [30]


@pytest.mark.parametrize("raw", ["7,abc,30", "", ",", "7,0,30", "7,-5"])
def test_rejects_invalid_input(raw):
    with pytest.raises(SystemExit) as exc:
        _parse_windows(raw)
    assert exc.value.code == 1


def test_infer_window_days_prefers_explicit():
    assert _infer_window_days("out/30d/acme-web-metrics.json", 7) == 7


def test_infer_window_days_from_namespaced_path():
    assert _infer_window_days("out/30d/acme-web-metrics.json", None) == 30
    assert _infer_window_days("/tmp/iris/7d/x-metrics.json", None) == 7


def test_infer_window_days_falls_back_to_90():
    assert _infer_window_days("out/acme-web-metrics.json", None) == 90


def test_resolve_windows_defaults_to_recommended_set():
    # Neither --days nor --windows given → analyze the recommended set.
    assert _resolve_windows(None, None) == list(RECOMMENDED_WINDOWS)


def test_resolve_windows_explicit_days_is_single_window():
    assert _resolve_windows(None, 30) == [30]


def test_resolve_windows_explicit_windows_wins_over_days():
    assert _resolve_windows("7,30", 90) == [7, 30]
