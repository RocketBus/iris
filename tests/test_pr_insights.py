"""Tests for iris pr — PR insights analysis and comment formatting.

Covers analyze_pr() and format_pr_comment().
Does NOT test CLI or subprocess calls (those require gh/git).

Runnable as: `python -m pytest tests/test_pr_insights.py -v`
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.pr_insights import (
    LARGE_PR_FILES,
    LARGE_PR_LINES,
    analyze_pr,
)
from iris.models.commit import Commit, FileChange
from iris.models.pull_request import CommitRef, PRReview, PullRequest
from iris.reports.pr_comment import format_pr_comment


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BASE_DATE = datetime(2026, 4, 1, tzinfo=timezone.utc)


def _pr(
    number: int = 42,
    title: str = "Add feature X",
    additions: int = 100,
    deletions: int = 20,
    changed_files: int = 5,
    reviews: list[PRReview] | None = None,
    commit_hashes: list[str] | None = None,
) -> PullRequest:
    refs = [CommitRef(hash=h) for h in (commit_hashes or [])]
    return PullRequest(
        number=number,
        title=title,
        author="alice",
        created_at=_BASE_DATE,
        merged_at=_BASE_DATE + timedelta(days=1),
        additions=additions,
        deletions=deletions,
        changed_files=changed_files,
        reviews=reviews or [],
        commit_refs=refs,
    )


def _commit(
    hash: str,
    co_authors: list[str] | None = None,
    days_offset: int = 0,
    files: list[FileChange] | None = None,
    message: str = "feat: something",
) -> Commit:
    return Commit(
        hash=hash,
        author="Alice",
        co_authors=co_authors or [],
        date=_BASE_DATE + timedelta(days=days_offset),
        files=files or [FileChange(path="src/main.py", lines_added=10, lines_removed=2)],
        message=message,
    )


# ---------------------------------------------------------------------------
# analyze_pr
# ---------------------------------------------------------------------------


def test_analyze_pr_basic_composition():
    pr = _pr()
    commits = [
        _commit("aaa", co_authors=["copilot@users.noreply.github.com"]),
        _commit("bbb", co_authors=["claude-code@iris.invalid"]),
        _commit("ccc"),
    ]
    result = analyze_pr(pr, commits)

    assert result.pr_number == 42
    assert result.commit_count == 3
    assert result.ai_commit_count == 2
    assert set(result.tools_detected) == {"Claude", "Copilot"}


def test_analyze_pr_all_human():
    pr = _pr()
    commits = [_commit("aaa"), _commit("bbb")]
    result = analyze_pr(pr, commits)

    assert result.ai_commit_count == 0
    assert result.tools_detected == []
    # Should not have a composition insight
    categories = [i.category for i in result.insights]
    assert "composition" not in categories


def test_analyze_pr_intent_summary():
    pr = _pr()
    commits = [
        _commit("aaa", message="feat: add login"),
        _commit("bbb", message="fix: null check"),
        _commit("ccc", message="feat: add signup"),
    ]
    result = analyze_pr(pr, commits)

    assert result.intent_summary.get("FEATURE", 0) >= 2
    assert result.intent_summary.get("FIX", 0) >= 1


def test_analyze_pr_large_pr_flagged():
    pr = _pr(additions=LARGE_PR_LINES + 100, deletions=50, changed_files=8)
    commits = [_commit("aaa")]
    result = analyze_pr(pr, commits)

    size_insights = [i for i in result.insights if i.category == "size"]
    assert len(size_insights) == 1
    assert size_insights[0].severity == "attention"


def test_analyze_pr_small_pr_not_flagged():
    pr = _pr(additions=50, deletions=10, changed_files=3)
    commits = [_commit("aaa")]
    result = analyze_pr(pr, commits)

    size_insights = [i for i in result.insights if i.category == "size"]
    assert len(size_insights) == 0


def test_analyze_pr_many_review_rounds():
    reviews = [
        PRReview(author="bob", state="CHANGES_REQUESTED", submitted_at=_BASE_DATE),
        PRReview(author="bob", state="CHANGES_REQUESTED", submitted_at=_BASE_DATE + timedelta(hours=2)),
        PRReview(author="bob", state="CHANGES_REQUESTED", submitted_at=_BASE_DATE + timedelta(hours=4)),
    ]
    pr = _pr(reviews=reviews)
    commits = [_commit("aaa")]
    result = analyze_pr(pr, commits)

    assert result.review_rounds == 3
    review_insights = [i for i in result.insights if i.category == "review"]
    assert len(review_insights) == 1
    assert review_insights[0].severity == "watch"


def test_analyze_pr_directory_concentration():
    pr = _pr(changed_files=6)
    commits = [
        _commit("aaa", files=[
            FileChange("src/api/auth.py", 10, 0),
            FileChange("src/api/users.py", 10, 0),
            FileChange("src/api/tokens.py", 10, 0),
            FileChange("src/api/middleware.py", 10, 0),
            FileChange("src/models/user.py", 10, 0),
            FileChange("tests/test_auth.py", 5, 0),
        ]),
    ]
    result = analyze_pr(pr, commits)

    conc_insights = [i for i in result.insights if i.category == "concentration"]
    assert len(conc_insights) == 1
    assert "src" in conc_insights[0].message


def test_analyze_pr_churn_context():
    pr = _pr()
    pr_commits = [
        _commit("aaa", days_offset=20, files=[
            FileChange("src/hot_file.py", 10, 2),
        ]),
    ]

    # Context: hot_file.py was modified multiple times recently
    context_commits = [
        _commit("ctx1", days_offset=0, files=[FileChange("src/hot_file.py", 5, 1)]),
        _commit("ctx2", days_offset=3, files=[FileChange("src/hot_file.py", 3, 2)]),
        _commit("ctx3", days_offset=5, files=[FileChange("src/other.py", 10, 0)]),
    ]

    result = analyze_pr(pr, pr_commits, context_commits=context_commits, churn_days=14)

    churn_insights = [i for i in result.insights if i.category == "churn_risk"]
    assert len(churn_insights) == 1
    assert churn_insights[0].severity == "watch"


def test_analyze_pr_no_context_no_churn_insight():
    pr = _pr()
    commits = [_commit("aaa")]
    result = analyze_pr(pr, commits, context_commits=None)

    churn_insights = [i for i in result.insights if i.category == "churn_risk"]
    assert len(churn_insights) == 0


# ---------------------------------------------------------------------------
# format_pr_comment
# ---------------------------------------------------------------------------


def test_format_contains_pr_number():
    pr = _pr(number=123)
    commits = [_commit("aaa", co_authors=["copilot@users.noreply.github.com"])]
    result = analyze_pr(pr, commits)
    markdown = format_pr_comment(result)

    assert "PR #123" in markdown


def test_format_contains_tool_names():
    pr = _pr()
    commits = [
        _commit("aaa", co_authors=["copilot@users.noreply.github.com"]),
        _commit("bbb", co_authors=["claude-code@iris.invalid"]),
    ]
    result = analyze_pr(pr, commits)
    markdown = format_pr_comment(result)

    assert "Copilot" in markdown
    assert "Claude" in markdown


def test_format_contains_footer():
    pr = _pr()
    commits = [_commit("aaa")]
    result = analyze_pr(pr, commits)
    markdown = format_pr_comment(result)

    assert "hypotheses" in markdown
    assert "Iris" in markdown


def test_format_contains_size_info():
    pr = _pr(additions=200, deletions=50, changed_files=8)
    commits = [_commit("aaa")]
    result = analyze_pr(pr, commits)
    markdown = format_pr_comment(result)

    assert "+200" in markdown
    assert "-50" in markdown
    assert "8 files" in markdown
