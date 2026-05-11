"""Tests for fix_targeting — disproportionality, origin/tool attribution.

Runnable as: `python -m pytest tests/test_fix_targeting.py -v`
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.fix_targeting import MIN_FIX_EVENTS, calculate_fix_targeting
from iris.analysis.origin_classifier import build_tool_map, classify_origins
from iris.models.commit import Commit, FileChange


_BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _commit(
    hash: str,
    days: int = 0,
    message: str = "feat: x",
    co_authors: list[str] | None = None,
    files: list[FileChange] | None = None,
) -> Commit:
    return Commit(
        hash=hash, author="Alice", co_authors=co_authors or [],
        date=_BASE + timedelta(days=days), message=message,
        files=files or [FileChange("src/main.py", 10, 0)],
    )


def _build_maps(commits):
    classified = classify_origins(commits)
    origin_map = {c.hash: o.value for c, o in classified}
    tool_map = build_tool_map(classified)
    return origin_map, tool_map


# ---------------------------------------------------------------------------
# Basic functionality
# ---------------------------------------------------------------------------


def test_returns_none_below_threshold():
    commits = [
        _commit("a", 0, "feat: x", files=[FileChange("f.py", 10, 0)]),
        _commit("b", 1, "fix: y", files=[FileChange("f.py", 2, 1)]),
    ]
    origin_map, _ = _build_maps(commits)
    assert calculate_fix_targeting(commits, origin_map) is None


def test_returns_none_with_one_commit():
    commits = [_commit("a")]
    origin_map, _ = _build_maps(commits)
    assert calculate_fix_targeting(commits, origin_map) is None


def test_all_human_no_disproportionality():
    """When all code is human, disproportionality should be ~1.0."""
    commits = []
    for i in range(MIN_FIX_EVENTS + 3):
        f = f"src/mod_{i}.py"
        commits.append(_commit(f"feat_{i}", i * 3, f"feat: add {i}", files=[FileChange(f, 20, 0)]))
        commits.append(_commit(f"fix_{i}", i * 3 + 1, f"fix: bug {i}", files=[FileChange(f, 3, 1)]))

    origin_map, _ = _build_maps(commits)
    result = calculate_fix_targeting(commits, origin_map)
    assert result is not None

    human = next((bo for bo in result.by_origin if bo.origin == "HUMAN"), None)
    assert human is not None
    # All code is human, all fixes target human → disproportionality ~1.0
    assert 0.9 <= human.disproportionality <= 1.1


def test_ai_code_disproportionate_fix_attraction():
    """AI writes fewer commits but attracts most fixes → disproportionality > 1."""
    commits = []
    # 3 AI features
    for i in range(3):
        commits.append(_commit(
            f"ai_{i}", i, f"feat: ai {i}",
            co_authors=["copilot@users.noreply.github.com"],
            files=[FileChange(f"src/ai_{i}.py", 20, 0)],
        ))
    # 5 human features
    for i in range(5):
        commits.append(_commit(
            f"h_{i}", i + 10, f"feat: human {i}",
            files=[FileChange(f"src/h_{i}.py", 20, 0)],
        ))
    # Fixes: 4 target AI files, 2 target human files
    for i in range(3):
        commits.append(_commit(
            f"fix_ai_{i}", 20 + i, f"fix: ai bug {i}",
            files=[FileChange(f"src/ai_{i % 3}.py", 3, 1)],
        ))
    commits.append(_commit(
        "fix_ai_3", 23, "fix: another ai bug",
        files=[FileChange("src/ai_0.py", 2, 1)],
    ))
    for i in range(2):
        commits.append(_commit(
            f"fix_h_{i}", 25 + i, f"fix: human bug {i}",
            files=[FileChange(f"src/h_{i}.py", 3, 1)],
        ))

    commits.sort(key=lambda c: c.date)
    origin_map, tool_map = _build_maps(commits)
    result = calculate_fix_targeting(commits, origin_map, tool_map)
    assert result is not None

    ai = next((bo for bo in result.by_origin if bo.origin == "AI_ASSISTED"), None)
    assert ai is not None
    # AI wrote 3/8 features (37.5%) but attracts 4/6 fixes (66.7%)
    assert ai.disproportionality > 1.0
    assert ai.fix_share_pct > ai.code_share_pct


def test_tool_attribution():
    """Fix targeting should attribute fixes to specific tools."""
    commits = []
    for i in range(MIN_FIX_EVENTS):
        commits.append(_commit(
            f"claude_{i}", i * 3, f"feat: claude {i}",
            co_authors=["claude-code@iris.invalid"],
            files=[FileChange(f"src/c_{i}.py", 20, 0)],
        ))
        commits.append(_commit(
            f"fix_{i}", i * 3 + 1, f"fix: bug in claude {i}",
            files=[FileChange(f"src/c_{i}.py", 3, 1)],
        ))

    commits.sort(key=lambda c: c.date)
    origin_map, tool_map = _build_maps(commits)
    result = calculate_fix_targeting(commits, origin_map, tool_map)
    assert result is not None

    claude = next((bt for bt in result.by_tool if bt.tool == "Claude"), None)
    assert claude is not None
    assert claude.fixes_attracted >= MIN_FIX_EVENTS


def test_fix_on_fix_skipped():
    """Fix targeting should look for the last non-fix commit, not chain fixes."""
    commits = [
        _commit("feat", 0, "feat: original",
                co_authors=["copilot@users.noreply.github.com"],
                files=[FileChange("f.py", 20, 0)]),
        _commit("fix1", 1, "fix: first fix", files=[FileChange("f.py", 3, 1)]),
        _commit("fix2", 2, "fix: second fix", files=[FileChange("f.py", 2, 1)]),
        _commit("fix3", 3, "fix: third fix", files=[FileChange("f.py", 1, 1)]),
        _commit("fix4", 4, "fix: fourth fix", files=[FileChange("f.py", 1, 1)]),
        _commit("fix5", 5, "fix: fifth fix", files=[FileChange("f.py", 1, 1)]),
    ]
    origin_map, tool_map = _build_maps(commits)
    result = calculate_fix_targeting(commits, origin_map, tool_map)
    assert result is not None

    # All fixes should target AI_ASSISTED (the original feat commit)
    ai = next((bo for bo in result.by_origin if bo.origin == "AI_ASSISTED"), None)
    assert ai is not None
    assert ai.fixes_attracted >= 1  # fix1 targets feat

    # fix2-fix5 target fix1 (which is a fix itself), so they should look
    # back further to "feat" — but our algorithm looks for last non-fix,
    # so fix2 targets feat (skipping fix1), fix3 targets feat, etc.


def test_merge_commits_excluded():
    """Merge commits should not count as targets."""
    commits = [
        _commit("feat", 0, "feat: x", files=[FileChange("f.py", 20, 0)]),
        Commit(hash="merge", author="Alice", date=_BASE + timedelta(days=1),
               message="Merge branch", files=[FileChange("f.py", 0, 0)], is_merge=True),
    ]
    # Should have 0 fix events (no FIX commits)
    origin_map = {"feat": "HUMAN", "merge": "HUMAN"}
    result = calculate_fix_targeting(commits, origin_map)
    assert result is None  # no fix events
