"""Regression tests for bot detection in origin_classifier.

Runnable as a plain script: `python tests/test_origin_classifier_bots.py`.
No external test framework required.
"""

import sys
from pathlib import Path

# Allow running from repo root without installation.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.origin_classifier import CommitOrigin, classify_origin
from iris.models.commit import Commit


def _commit(author: str, co_authors: list[str] | None = None) -> Commit:
    return Commit(hash="deadbeef", author=author, co_authors=co_authors or [])


def test_dependabot_bracketed_is_bot() -> None:
    assert classify_origin(_commit("dependabot[bot]")) is CommitOrigin.BOT


def test_github_actions_bracketed_is_bot() -> None:
    assert classify_origin(_commit("github-actions[bot]")) is CommitOrigin.BOT


def test_jenkins_standalone_is_bot() -> None:
    # Regression: jenkins has no [bot] suffix and was missed before the expansion.
    assert classify_origin(_commit("jenkins")) is CommitOrigin.BOT


def test_snyk_bot_suffix_is_bot() -> None:
    # Regression: covered by explicit name AND by generic `-bot` suffix rule.
    assert classify_origin(_commit("snyk-bot")) is CommitOrigin.BOT


def test_travis_ci_is_bot() -> None:
    assert classify_origin(_commit("travis-ci")) is CommitOrigin.BOT


def test_unknown_dash_bot_suffix_is_bot() -> None:
    # Generic suffix rule catches bots not in the explicit list.
    assert classify_origin(_commit("some-random-bot")) is CommitOrigin.BOT


def test_kody_ai_is_bot() -> None:
    # kody.ai is a popular third-party AI code reviewer SaaS — its bot login
    # has no [bot] or -bot suffix, so it needs an explicit entry.
    assert classify_origin(_commit("kody-ai")) is CommitOrigin.BOT
    assert classify_origin(_commit("kody")) is CommitOrigin.BOT


def test_clickbus_pai_is_bot() -> None:
    # ClickBus Programmer Assistant (clickbus-pai) — org-specific automation
    # account that auto-reviews / auto-approves PRs.
    assert classify_origin(_commit("clickbus-pai")) is CommitOrigin.BOT
    assert classify_origin(_commit("ClickBus-PAI")) is CommitOrigin.BOT


def test_human_with_ai_suffix_in_name_stays_human() -> None:
    # Regression guard: don't let the kody/-pai entries accidentally match
    # humans whose names happen to contain those substrings as fragments.
    assert classify_origin(_commit("random-user-ai")) is CommitOrigin.HUMAN


def test_ai_co_author_still_wins_over_bot_author() -> None:
    c = _commit("dependabot[bot]", co_authors=["copilot@users.noreply.github.com"])
    assert classify_origin(c) is CommitOrigin.AI_ASSISTED


def test_human_without_co_authors() -> None:
    assert classify_origin(_commit("Alice")) is CommitOrigin.HUMAN


def test_human_name_containing_bot_substring_not_misclassified() -> None:
    # "Abbott" contains "bot" but not as `-bot` or `[bot]`. Must stay HUMAN.
    assert classify_origin(_commit("Abbott")) is CommitOrigin.HUMAN


def test_copilot_co_author_is_ai_assisted() -> None:
    c = _commit("Alice", co_authors=["copilot@users.noreply.github.com"])
    assert classify_origin(c) is CommitOrigin.AI_ASSISTED


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
