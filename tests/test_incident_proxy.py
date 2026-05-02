"""Tests for incident proxy metrics — revert attribution and fix targeting.

Covers:
- revert_detector: revert attribution by origin/tool
- fix_targeting: fix targeting ratio by origin/tool

Runnable as: `python -m pytest tests/test_incident_proxy.py -v`
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.fix_targeting import calculate_fix_targeting
from iris.analysis.origin_classifier import (
    build_tool_map,
    classify_origins,
)
from iris.analysis.revert_detector import (
    detect_reverts,
    extract_reverted_hash,
)
from iris.models.commit import Commit, FileChange


_BASE_DATE = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _commit(
    hash: str,
    days_offset: int = 0,
    message: str = "feat: something",
    co_authors: list[str] | None = None,
    files: list[FileChange] | None = None,
) -> Commit:
    return Commit(
        hash=hash,
        author="Alice",
        co_authors=co_authors or [],
        date=_BASE_DATE + timedelta(days=days_offset),
        message=message,
        files=files or [FileChange("src/main.py", 10, 2)],
    )


# ---------------------------------------------------------------------------
# extract_reverted_hash
# ---------------------------------------------------------------------------


def test_extract_reverted_hash_standard():
    c = _commit("aaa", message='Revert "Add feature"\n\nThis reverts commit abc123def.')
    assert extract_reverted_hash(c) == "abc123def"


def test_extract_reverted_hash_none():
    c = _commit("aaa", message="feat: add login")
    assert extract_reverted_hash(c) is None


# ---------------------------------------------------------------------------
# detect_reverts with origin/tool attribution
# ---------------------------------------------------------------------------


def test_revert_by_origin_attributes_correctly():
    original = _commit("abc123", days_offset=0, message="feat: add feature",
                       co_authors=["copilot@users.noreply.github.com"],
                       files=[FileChange("src/feature.py", 50, 0)])
    revert = _commit("def456", days_offset=1,
                     message='Revert "Add feature"\n\nThis reverts commit abc123.',
                     files=[FileChange("src/feature.py", 0, 50)])
    human = _commit("ghi789", days_offset=2, message="feat: other work")

    commits = [original, revert, human]
    classified = classify_origins(commits)
    origin_map = {c.hash: origin.value for c, origin in classified}
    tool_map = build_tool_map(classified)

    result = detect_reverts(commits, origin_map=origin_map, tool_map=tool_map)

    assert result.commits_revert == 1

    # The revert targets AI_ASSISTED code (Copilot)
    ai_entry = next((bo for bo in result.by_origin if bo.origin == "AI_ASSISTED"), None)
    assert ai_entry is not None
    assert ai_entry.reverts == 1

    # Tool attribution
    copilot_entry = next((bt for bt in result.by_tool if bt.tool == "Copilot"), None)
    assert copilot_entry is not None
    assert copilot_entry.reverts == 1


def test_revert_backward_compat_no_maps():
    commits = [
        _commit("aaa", message="feat: x"),
        _commit("bbb", message='Revert "x"\n\nThis reverts commit aaa.'),
    ]
    result = detect_reverts(commits)

    assert result.commits_revert == 1
    assert result.by_origin == []
    assert result.by_tool == []


# ---------------------------------------------------------------------------
# fix_targeting
# ---------------------------------------------------------------------------


def test_fix_targeting_ai_code_attracts_fixes():
    # AI commit introduces code, then human fixes it
    commits = [
        _commit("ai1", days_offset=0, message="feat: add auth",
                co_authors=["copilot@users.noreply.github.com"],
                files=[FileChange("src/auth.py", 50, 0)]),
        _commit("ai2", days_offset=1, message="feat: add api",
                co_authors=["claude-code@iris.clickbus.com"],
                files=[FileChange("src/api.py", 40, 0)]),
        _commit("h1", days_offset=2, message="feat: add utils",
                files=[FileChange("src/utils.py", 30, 0)]),
        _commit("h2", days_offset=3, message="feat: add models",
                files=[FileChange("src/models.py", 20, 0)]),
        _commit("h3", days_offset=4, message="feat: add views",
                files=[FileChange("src/views.py", 25, 0)]),
        # Fixes targeting AI code
        _commit("fix1", days_offset=5, message="fix: null check in auth",
                files=[FileChange("src/auth.py", 3, 1)]),
        _commit("fix2", days_offset=6, message="fix: api validation",
                files=[FileChange("src/api.py", 5, 2)]),
        _commit("fix3", days_offset=7, message="fix: auth edge case",
                files=[FileChange("src/auth.py", 2, 1)]),
        # Fixes targeting human code
        _commit("fix4", days_offset=8, message="fix: utils crash",
                files=[FileChange("src/utils.py", 2, 1)]),
        _commit("fix5", days_offset=9, message="fix: models typo",
                files=[FileChange("src/models.py", 1, 1)]),
    ]

    classified = classify_origins(commits)
    origin_map = {c.hash: origin.value for c, origin in classified}
    tool_map = build_tool_map(classified)

    result = calculate_fix_targeting(commits, origin_map, tool_map)
    assert result is not None

    ai_entry = next((bo for bo in result.by_origin if bo.origin == "AI_ASSISTED"), None)
    human_entry = next((bo for bo in result.by_origin if bo.origin == "HUMAN"), None)

    assert ai_entry is not None
    assert human_entry is not None

    # AI code should attract more fixes proportionally
    assert ai_entry.fixes_attracted >= 2  # auth.py fix1, api.py fix2 (fix3 targets fix1, not AI)
    assert ai_entry.disproportionality > 1.0  # overrepresented in fixes


def test_fix_targeting_none_below_threshold():
    # Too few fix events
    commits = [
        _commit("a", days_offset=0, message="feat: x",
                files=[FileChange("f.py", 10, 0)]),
        _commit("b", days_offset=1, message="fix: y",
                files=[FileChange("f.py", 2, 1)]),
    ]
    classified = classify_origins(commits)
    origin_map = {c.hash: origin.value for c, origin in classified}

    result = calculate_fix_targeting(commits, origin_map)
    assert result is None


def test_fix_targeting_tool_attribution():
    commits = []
    # 5 Copilot features, each followed by a fix
    for i in range(5):
        commits.append(_commit(
            f"feat_{i}", days_offset=i * 3, message=f"feat: feature {i}",
            co_authors=["copilot@users.noreply.github.com"],
            files=[FileChange(f"src/mod_{i}.py", 20, 0)],
        ))
        commits.append(_commit(
            f"fix_{i}", days_offset=i * 3 + 1, message=f"fix: bug in feature {i}",
            files=[FileChange(f"src/mod_{i}.py", 3, 1)],
        ))

    classified = classify_origins(commits)
    origin_map = {c.hash: origin.value for c, origin in classified}
    tool_map = build_tool_map(classified)

    result = calculate_fix_targeting(commits, origin_map, tool_map)
    assert result is not None
    assert result.total_fix_events >= 5

    copilot = next((bt for bt in result.by_tool if bt.tool == "Copilot"), None)
    assert copilot is not None
    assert copilot.fixes_attracted >= 5
