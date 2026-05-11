"""Tests for AI metrics segmented by tool.

Covers build_tool_map(), and by_tool output in:
- cascade_detector
- new_code_churn
- duplicate_detector

Durability is excluded because it requires git blame (subprocess).

Runnable as: `python -m pytest tests/test_tool_segmentation.py -v`
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.origin_classifier import (
    CommitOrigin,
    build_tool_map,
    classify_origins,
    detect_tool,
)
from iris.models.commit import Commit, FileChange


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BASE_DATE = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _commit(
    hash: str,
    author: str = "Alice",
    co_authors: list[str] | None = None,
    days_offset: int = 0,
    files: list[FileChange] | None = None,
    message: str = "",
) -> Commit:
    return Commit(
        hash=hash,
        author=author,
        co_authors=co_authors or [],
        date=_BASE_DATE + timedelta(days=days_offset),
        files=files or [FileChange(path="src/main.py", lines_added=10, lines_removed=2)],
        message=message,
    )


# ---------------------------------------------------------------------------
# build_tool_map
# ---------------------------------------------------------------------------


def test_build_tool_map_maps_ai_commits_to_tools():
    commits = [
        _commit("aaa", co_authors=["copilot@users.noreply.github.com"]),
        _commit("bbb", co_authors=["claude-code@iris.invalid"]),
        _commit("ccc"),  # human
        _commit("ddd", author="dependabot[bot]"),  # bot
    ]
    classified = classify_origins(commits)
    tool_map = build_tool_map(classified)

    assert tool_map == {"aaa": "Copilot", "bbb": "Claude"}


def test_build_tool_map_empty_for_all_human():
    commits = [_commit("aaa"), _commit("bbb")]
    classified = classify_origins(commits)
    tool_map = build_tool_map(classified)

    assert tool_map == {}


def test_build_tool_map_cursor():
    commits = [_commit("aaa", co_authors=["cursor@iris.invalid"])]
    classified = classify_origins(commits)
    tool_map = build_tool_map(classified)

    assert tool_map == {"aaa": "Cursor"}


# ---------------------------------------------------------------------------
# detect_tool coverage
# ---------------------------------------------------------------------------


def test_detect_tool_all_patterns():
    cases = [
        (["copilot@github.com"], "Copilot"),
        (["github-copilot@users.noreply.github.com"], "Copilot"),
        (["claude-code@iris.invalid"], "Claude"),
        (["noreply@anthropic.com"], "Claude"),
        (["cursor@iris.invalid"], "Cursor"),
        (["codeium@iris.invalid"], "Codeium"),
        (["tabnine@iris.invalid"], "Tabnine"),
        (["amazon-q@iris.invalid"], "Amazon Q"),
        (["gemini@iris.invalid"], "Gemini"),
    ]
    for co_authors, expected_tool in cases:
        c = _commit("x", co_authors=co_authors)
        assert detect_tool(c) == expected_tool, f"Failed for {co_authors}"


def test_detect_tool_none_for_human():
    c = _commit("x")
    assert detect_tool(c) is None


# ---------------------------------------------------------------------------
# cascade_detector by_tool
# ---------------------------------------------------------------------------


def test_cascade_by_tool_populates_when_threshold_met():
    from iris.analysis.cascade_detector import detect_cascades, MIN_COMMITS_PER_ORIGIN

    # Create enough Copilot commits to meet threshold, with some triggering cascades.
    commits = []
    for i in range(MIN_COMMITS_PER_ORIGIN + 2):
        # Trigger commit (FEATURE)
        commits.append(_commit(
            hash=f"trigger_{i:03d}",
            co_authors=["copilot@users.noreply.github.com"],
            days_offset=i * 10,
            files=[FileChange(path=f"src/file_{i}.py", lines_added=20, lines_removed=0)],
            message=f"feat: add feature {i}",
        ))
        # Fix commit within cascade window (same file)
        commits.append(_commit(
            hash=f"fix_{i:03d}",
            days_offset=i * 10 + 2,
            files=[FileChange(path=f"src/file_{i}.py", lines_added=3, lines_removed=1)],
            message=f"fix: fix bug in feature {i}",
        ))

    commits.sort(key=lambda c: c.date)
    classified = classify_origins(commits)
    tool_map = build_tool_map(classified)

    result = detect_cascades(commits, classified, tool_map=tool_map)
    assert result is not None
    assert len(result.by_tool) > 0

    copilot_entry = next((bt for bt in result.by_tool if bt.tool == "Copilot"), None)
    assert copilot_entry is not None
    assert copilot_entry.total_commits >= MIN_COMMITS_PER_ORIGIN
    assert copilot_entry.cascades > 0


def test_cascade_by_tool_empty_below_threshold():
    from iris.analysis.cascade_detector import detect_cascades

    # Only 2 Copilot commits — below threshold
    commits = [
        _commit("a1", co_authors=["copilot@users.noreply.github.com"], days_offset=0,
                files=[FileChange("f.py", 10, 0)], message="feat: x"),
        _commit("a2", days_offset=1,
                files=[FileChange("f.py", 2, 1)], message="fix: y"),
        # Add enough human commits so the function doesn't return None
        *[_commit(f"h{i}", days_offset=i+10,
                  files=[FileChange(f"src/{i}.py", 10, 0)], message="feat: h")
          for i in range(10)],
    ]
    commits.sort(key=lambda c: c.date)
    classified = classify_origins(commits)
    tool_map = build_tool_map(classified)

    result = detect_cascades(commits, classified, tool_map=tool_map)
    if result:
        assert len(result.by_tool) == 0


def test_cascade_backward_compat_no_tool_map():
    from iris.analysis.cascade_detector import detect_cascades

    commits = [
        _commit("a", days_offset=0, files=[FileChange("f.py", 10, 0)], message="feat: x"),
        _commit("b", days_offset=1, files=[FileChange("f.py", 2, 1)], message="fix: y"),
        *[_commit(f"h{i}", days_offset=i+10,
                  files=[FileChange(f"src/{i}.py", 10, 0)], message="feat: h")
          for i in range(10)],
    ]
    commits.sort(key=lambda c: c.date)
    classified = classify_origins(commits)

    # No tool_map passed — should work without error
    result = detect_cascades(commits, classified)
    if result:
        assert result.by_tool == []


# ---------------------------------------------------------------------------
# new_code_churn by_tool
# ---------------------------------------------------------------------------


def test_new_code_churn_by_tool_populates():
    from iris.analysis.new_code_churn import (
        MIN_FILES_PER_ORIGIN,
        calculate_new_code_churn,
    )

    commits = []
    # Create enough Claude commits with new code that gets churned
    for i in range(max(MIN_FILES_PER_ORIGIN, 10) + 2):
        path = f"src/module_{i}.py"
        # Introducing commit (Claude)
        commits.append(_commit(
            hash=f"intro_{i:03d}",
            co_authors=["claude-code@iris.invalid"],
            days_offset=i * 5,
            files=[FileChange(path=path, lines_added=20, lines_removed=0)],
        ))
        # Churn commit within 2 weeks (human)
        commits.append(_commit(
            hash=f"churn_{i:03d}",
            days_offset=i * 5 + 3,
            files=[FileChange(path=path, lines_added=5, lines_removed=3)],
        ))

    commits.sort(key=lambda c: c.date)
    classified = classify_origins(commits)
    tool_map = build_tool_map(classified)

    result = calculate_new_code_churn(commits, classified, tool_map=tool_map)
    assert result is not None
    assert len(result.by_tool) > 0

    claude_entry = next((bt for bt in result.by_tool if bt.tool == "Claude"), None)
    assert claude_entry is not None
    assert claude_entry.files_with_new_code >= MIN_FILES_PER_ORIGIN
    assert claude_entry.churn_rate_2w > 0


def test_new_code_churn_backward_compat():
    from iris.analysis.new_code_churn import calculate_new_code_churn

    commits = []
    for i in range(15):
        path = f"src/m_{i}.py"
        commits.append(_commit(
            hash=f"c_{i:03d}", days_offset=i * 3,
            files=[FileChange(path=path, lines_added=10, lines_removed=0)],
        ))
        commits.append(_commit(
            hash=f"r_{i:03d}", days_offset=i * 3 + 1,
            files=[FileChange(path=path, lines_added=2, lines_removed=1)],
        ))

    commits.sort(key=lambda c: c.date)
    classified = classify_origins(commits)

    result = calculate_new_code_churn(commits, classified)
    assert result is not None
    assert result.by_tool == []


# ---------------------------------------------------------------------------
# duplicate_detector by_tool
# ---------------------------------------------------------------------------


def test_duplicate_by_tool_populates():
    from iris.analysis.duplicate_detector import (
        MIN_COMMITS_PER_ORIGIN,
        detect_duplicates,
    )
    from iris.ingestion.diff_reader import CommitDiff, FileDiff

    # Build enough Cursor commits with duplicate blocks
    diffs = []
    commits = []
    dup_lines = [f"    result += compute(i + {j})" for j in range(6)]  # 6 identical lines

    for i in range(MIN_COMMITS_PER_ORIGIN + 2):
        h = f"cursor_{i:03d}"
        commits.append(_commit(
            hash=h,
            co_authors=["cursor@iris.invalid"],
            days_offset=i,
            files=[
                FileChange(path=f"src/a_{i}.py", lines_added=10, lines_removed=0),
                FileChange(path=f"src/b_{i}.py", lines_added=10, lines_removed=0),
            ],
        ))
        diffs.append(CommitDiff(
            commit_hash=h,
            file_diffs=[
                FileDiff(path=f"src/a_{i}.py", added_lines=tuple(dup_lines + [f"# unique a {i}"]), removed_lines=()),
                FileDiff(path=f"src/b_{i}.py", added_lines=tuple(dup_lines + [f"# unique b {i}"]), removed_lines=()),
            ],
        ))

    classified = classify_origins(commits)
    tool_map = build_tool_map(classified)

    result = detect_duplicates(diffs, classified, tool_map=tool_map)
    assert result is not None
    assert len(result.by_tool) > 0

    cursor_entry = next((bt for bt in result.by_tool if bt.tool == "Cursor"), None)
    assert cursor_entry is not None
    assert cursor_entry.commits_analyzed >= MIN_COMMITS_PER_ORIGIN


def test_duplicate_backward_compat():
    from iris.analysis.duplicate_detector import detect_duplicates
    from iris.ingestion.diff_reader import CommitDiff, FileDiff

    diffs = []
    commits = []
    for i in range(12):
        h = f"h_{i:03d}"
        commits.append(_commit(hash=h, days_offset=i, files=[
            FileChange(f"a_{i}.py", 10, 0), FileChange(f"b_{i}.py", 10, 0),
        ]))
        diffs.append(CommitDiff(commit_hash=h, file_diffs=[
            FileDiff(path=f"a_{i}.py", added_lines=tuple(f"line {j}" for j in range(6)), removed_lines=()),
            FileDiff(path=f"b_{i}.py", added_lines=tuple(f"line {j}" for j in range(6)), removed_lines=()),
        ]))

    classified = classify_origins(commits)

    result = detect_duplicates(diffs, classified)
    assert result is not None
    assert result.by_tool == []
