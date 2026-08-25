"""Tests for `iris analyze --windows` parsing (issue #80).

Runnable as: `python -m pytest tests/test_cli_windows.py -v`
"""

import argparse
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.cli import (
    RECOMMENDED_WINDOWS,
    _effective_churn_days,
    _infer_window_days,
    _parse_windows,
    _push_after_analysis,
    _resolve_windows,
    _run_multi_window,
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


def test_multi_window_runs_widest_first():
    seen: list[int] = []
    _run_multi_window(lambda args: seen.append(args.days), argparse.Namespace(churn_days=14), [7, 90, 30])
    assert seen == [90, 30, 7]


def test_multi_window_crash_does_not_starve_narrower_windows():
    # A window that raises must not stop the remaining (narrower) windows
    # from running — each window is an independent snapshot the platform
    # serves on its own (issue #80).
    seen: list[int] = []

    def runner(args):
        if args.days == 30:
            raise RuntimeError("boom")
        seen.append(args.days)

    with pytest.raises(SystemExit) as exc:
        _run_multi_window(runner, argparse.Namespace(churn_days=14), [7, 90, 30])

    assert seen == [90, 7]
    assert exc.value.code == 1


def test_multi_window_no_commits_is_not_a_failure():
    # A window with no commits exits 0 from inside the runner — that must not
    # be treated as a failed window, nor stop the remaining windows.
    seen: list[int] = []

    def runner(args):
        if args.days == 30:
            sys.exit(0)
        seen.append(args.days)

    _run_multi_window(runner, argparse.Namespace(churn_days=14), [7, 90, 30])
    assert seen == [90, 7]


def test_multi_window_genuine_exit_aborts_remaining_windows():
    # A non-zero SystemExit (bad path, not a git repo) applies to every
    # window equally, so it should still abort the whole run.
    def runner(args):
        if args.days == 30:
            sys.exit(1)

    with pytest.raises(SystemExit) as exc:
        _run_multi_window(runner, argparse.Namespace(churn_days=14), [7, 90, 30])
    assert exc.value.code == 1


def test_effective_churn_days_caps_to_the_lookback():
    # A churn pair can't be more than `days` apart when only `days` of
    # commits were loaded, so churn_days must never exceed days.
    assert _effective_churn_days(14, 90) == 14
    assert _effective_churn_days(14, 7) == 7
    assert _effective_churn_days(14, 14) == 14


def test_multi_window_caps_churn_days_per_window():
    # Each window in a batch gets its own effective churn window, capped
    # from the originally requested value — not from whatever the previous
    # (wider) window left args.churn_days at.
    seen: list[tuple[int, int]] = []
    args = argparse.Namespace(churn_days=14)
    _run_multi_window(
        lambda a: seen.append((a.days, a.churn_days)),
        args,
        [7, 15, 90],
    )
    assert seen == [(90, 14), (15, 14), (7, 7)]


# _push_after_analysis (issue #181): its return value is what tells the
# caller in cli.py whether to record iris.push.success, iris.push.failure,
# or neither (not authenticated) — a bug previously made it record success
# unconditionally, even when the push had failed.


def test_push_after_analysis_returns_true_on_success(monkeypatch):
    monkeypatch.setattr("iris.platform.config.get_auth", lambda: ("http://fake-server", "tok"))
    monkeypatch.setattr("iris.platform.config.get_github_user", lambda: None)
    monkeypatch.setattr("iris.platform.push.push_metrics", lambda **kwargs: {"run_id": "abc123"})

    assert _push_after_analysis("metrics.json", "acme/web", 90) is True


def test_push_after_analysis_returns_false_on_push_failure(monkeypatch):
    monkeypatch.setattr("iris.platform.config.get_auth", lambda: ("http://fake-server", "tok"))
    monkeypatch.setattr("iris.platform.config.get_github_user", lambda: None)

    def _boom(**kwargs):
        raise RuntimeError("network unreachable")

    monkeypatch.setattr("iris.platform.push.push_metrics", _boom)

    assert _push_after_analysis("metrics.json", "acme/web", 90) is False


def test_push_after_analysis_returns_none_when_not_authenticated(monkeypatch):
    monkeypatch.setattr("iris.platform.config.get_auth", lambda: None)

    assert _push_after_analysis("metrics.json", "acme/web", 90) is None
