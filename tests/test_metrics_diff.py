"""Tests for metrics_diff — field-by-field comparison of two metrics.json.

Runnable as: `python -m pytest tests/test_metrics_diff.py -v`
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.reports.metrics_diff import (
    MISSING,
    Divergence,
    compare_metrics,
    flatten_metrics,
    path_is_ignored,
)


def test_flatten_nested_dict_uses_dotted_paths():
    payload = {"churn_by_origin": {"HUMAN": {"churn_events": 3}}}
    assert flatten_metrics(payload) == {"churn_by_origin.HUMAN.churn_events": 3}


def test_flatten_list_uses_indexed_paths():
    payload = {"author_velocity": {"authors": [{"total_commits": 2}]}}
    assert flatten_metrics(payload) == {
        "author_velocity.authors[0].total_commits": 2
    }


def test_flatten_marks_empty_containers():
    # Without this, {} and "missing key" would be indistinguishable in the comparison.
    assert flatten_metrics({"a": {}, "b": []}) == {"a": {}, "b": []}


def test_flatten_of_an_empty_root_is_empty():
    # Regression: the empty-container rule applies to a nested value, not to
    # the root. Without the guard, `{}` became the leaf `{"": {}}` and comparing
    # against an empty payload invented an empty-path divergence.
    assert flatten_metrics({}) == {}
    assert flatten_metrics([]) == {}


def test_identical_payloads_have_no_divergences():
    payload = {"commits_total": 2, "churn_by_origin": {"HUMAN": {"churn_events": 0}}}
    assert compare_metrics(payload, dict(payload)) == []


def test_different_value_is_reported_with_both_sides():
    a = {"commits_total": 2}
    b = {"commits_total": 3}
    assert compare_metrics(a, b) == [
        Divergence(path="commits_total", expected=2, found=3)
    ]


def test_key_only_in_first_payload_is_reported_as_missing():
    assert compare_metrics({"durability_files_analyzed": 4}, {}) == [
        Divergence(path="durability_files_analyzed", expected=4, found=MISSING)
    ]


def test_key_only_in_second_payload_is_reported_as_missing():
    assert compare_metrics({}, {"durability_files_analyzed": 4}) == [
        Divergence(path="durability_files_analyzed", expected=MISSING, found=4)
    ]


def test_divergences_come_back_sorted_by_path():
    a = {"z": 1, "a": 1}
    b = {"z": 2, "a": 2}
    assert [d.path for d in compare_metrics(a, b)] == ["a", "z"]


def test_ignored_exact_path_is_not_reported():
    ignored = {"commits_total": "test reason"}
    assert compare_metrics({"commits_total": 2}, {"commits_total": 3}, ignored=ignored) == []


def test_ignore_wildcard_matches_one_segment_only():
    ignored = {"durability_by_origin.*.median_age_days": "test reason"}
    assert path_is_ignored("durability_by_origin.HUMAN.median_age_days", ignored)
    assert path_is_ignored("durability_by_origin.AI_ASSISTED.median_age_days", ignored)
    # A `*` covers one segment, not the whole traversal.
    assert not path_is_ignored("durability_by_origin.HUMAN.deep.median_age_days", ignored)
    assert not path_is_ignored("durability_by_origin.HUMAN.survival_rate", ignored)


def test_ignore_list_ships_empty():
    from iris.reports.metrics_diff import IGNORED_PATHS

    # Measured: two engine runs on the same commit do not diverge on any key.
    # A new entry here requires proof of drift from a real run.
    assert IGNORED_PATHS == {}


import json
import subprocess

from iris.reports.metrics_diff import format_divergences

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "compare_metrics.py"


def test_format_is_empty_when_there_is_nothing_to_report():
    assert format_divergences([]) == ""


def test_format_names_the_path_and_both_sides():
    out = format_divergences(
        [Divergence(path="commits_total", expected=2, found=3)]
    )
    assert "commits_total" in out
    assert "2" in out
    assert "3" in out


def test_format_renders_the_missing_sentinel_readably():
    out = format_divergences(
        [Divergence(path="durability_files_analyzed", expected=4, found=MISSING)]
    )
    assert "<missing>" in out


def _write(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_cli_exits_zero_on_identical_files(tmp_path):
    payload = {"commits_total": 2}
    a = _write(tmp_path / "a.json", payload)
    b = _write(tmp_path / "b.json", payload)
    result = subprocess.run(
        [sys.executable, str(SCRIPT), str(a), str(b)],
        capture_output=True, text=True,
    )
    assert result.returncode == 0
    assert "identic" in result.stdout.lower()


def test_cli_exits_one_and_names_the_key_on_divergence(tmp_path):
    a = _write(tmp_path / "a.json", {"commits_total": 2})
    b = _write(tmp_path / "b.json", {"commits_total": 3})
    result = subprocess.run(
        [sys.executable, str(SCRIPT), str(a), str(b)],
        capture_output=True, text=True,
    )
    assert result.returncode == 1
    assert "commits_total" in result.stdout


def test_cli_exits_two_when_a_file_is_missing(tmp_path):
    a = _write(tmp_path / "a.json", {"commits_total": 2})
    result = subprocess.run(
        [sys.executable, str(SCRIPT), str(a), str(tmp_path / "nope.json")],
        capture_output=True, text=True,
    )
    assert result.returncode == 2
    assert "nope.json" in result.stderr
