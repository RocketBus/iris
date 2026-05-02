"""Tests for revert_detector — pattern matching, hash extraction, origin attribution.

Runnable as: `python -m pytest tests/test_revert_detector.py -v`
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.revert_detector import (
    detect_reverts,
    extract_reverted_hash,
    is_revert,
)
from iris.models.commit import Commit, FileChange


def _commit(hash: str = "aaa", message: str = "feat: x") -> Commit:
    return Commit(
        hash=hash, author="Alice", message=message,
        date=datetime(2026, 1, 1, tzinfo=timezone.utc),
        files=[FileChange("f.py", 10, 0)],
    )


# ---------------------------------------------------------------------------
# is_revert
# ---------------------------------------------------------------------------


def test_revert_quoted_title():
    assert is_revert(_commit(message='Revert "Add login flow"'))


def test_revert_unquoted_title():
    assert is_revert(_commit(message="Revert add login flow"))


def test_revert_body_hash():
    assert is_revert(_commit(message="fix stuff\n\nThis reverts commit abc123def."))


def test_revert_case_insensitive():
    assert is_revert(_commit(message='revert "something"'))


def test_not_revert_normal_commit():
    assert not is_revert(_commit(message="feat: add login"))


def test_not_revert_contains_revert_word():
    assert not is_revert(_commit(message="fix: revert-button styling"))


# ---------------------------------------------------------------------------
# extract_reverted_hash
# ---------------------------------------------------------------------------


def test_extract_hash_full_40_char():
    c = _commit(message="Revert x\n\nThis reverts commit a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2.")
    assert extract_reverted_hash(c) == "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"


def test_extract_hash_short():
    c = _commit(message="Revert x\n\nThis reverts commit abc123.")
    assert extract_reverted_hash(c) == "abc123"


def test_extract_hash_none_when_no_pattern():
    c = _commit(message="feat: add feature")
    assert extract_reverted_hash(c) is None


def test_extract_hash_case_insensitive():
    c = _commit(message="Revert x\n\nthis Reverts Commit def456.")
    assert extract_reverted_hash(c) == "def456"


# ---------------------------------------------------------------------------
# detect_reverts — origin attribution
# ---------------------------------------------------------------------------


def test_detect_reverts_basic_count():
    commits = [
        _commit("a", "feat: add x"),
        _commit("b", 'Revert "add x"\n\nThis reverts commit a.'),
        _commit("c", "feat: add y"),
    ]
    result = detect_reverts(commits)
    assert result.commits_revert == 1
    assert result.commits_total == 3
    assert "b" in result.revert_hashes


def test_detect_reverts_zero():
    commits = [_commit("a", "feat: x"), _commit("b", "fix: y")]
    result = detect_reverts(commits)
    assert result.commits_revert == 0
    assert result.revert_rate == 0.0


def test_detect_reverts_origin_attribution():
    origin_map = {"aabbcc": "AI_ASSISTED", "ddeeff": "HUMAN"}
    commits = [
        _commit("aabbcc", "feat: ai feature"),
        _commit("ddeeff", 'Revert "ai feature"\n\nThis reverts commit aabbcc.'),
    ]
    result = detect_reverts(commits, origin_map=origin_map)

    ai = next((bo for bo in result.by_origin if bo.origin == "AI_ASSISTED"), None)
    assert ai is not None
    assert ai.reverts == 1


def test_detect_reverts_tool_attribution():
    origin_map = {"ai1": "AI_ASSISTED"}
    tool_map = {"ai1": "Copilot"}
    commits = [
        _commit("ai1", "feat: copilot code"),
        _commit("rev1", 'Revert "copilot code"\n\nThis reverts commit ai1.'),
    ]
    result = detect_reverts(commits, origin_map=origin_map, tool_map=tool_map)

    copilot = next((bt for bt in result.by_tool if bt.tool == "Copilot"), None)
    assert copilot is not None
    assert copilot.reverts == 1


def test_detect_reverts_abbreviated_hash_match():
    origin_map = {"abcdef1234567890": "AI_ASSISTED"}
    commits = [
        _commit("abcdef1234567890", "feat: something"),
        _commit("rev", 'Revert "something"\n\nThis reverts commit abcdef12.'),
    ]
    result = detect_reverts(commits, origin_map=origin_map)

    ai = next((bo for bo in result.by_origin if bo.origin == "AI_ASSISTED"), None)
    assert ai is not None
    assert ai.reverts == 1


def test_detect_reverts_no_hash_in_message():
    """Revert detected by title pattern but no 'This reverts commit' body."""
    origin_map = {"a": "AI_ASSISTED"}
    commits = [
        _commit("a", "feat: x"),
        _commit("b", 'Revert "x"'),  # no body with hash
    ]
    result = detect_reverts(commits, origin_map=origin_map)
    # Revert is counted but NOT attributed (no hash to match)
    assert result.commits_revert == 1
    assert len(result.by_origin) == 0 or all(bo.reverts == 0 for bo in result.by_origin)
