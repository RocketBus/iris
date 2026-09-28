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


def _commit(author: str, attribution_trailers: list[str] | None = None) -> Commit:
    return Commit(
        hash="deadbeef",
        author=author,
        attribution_trailers=attribution_trailers or [],
    )


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


def test_human_with_ai_suffix_in_name_stays_human() -> None:
    # Regression guard: don't let the kody entry accidentally match humans
    # whose names happen to contain that substring as a fragment.
    assert classify_origin(_commit("random-user-ai")) is CommitOrigin.HUMAN


def test_ai_co_author_still_wins_over_bot_author() -> None:
    c = _commit("dependabot[bot]", attribution_trailers=["copilot@users.noreply.github.com"])
    assert classify_origin(c) is CommitOrigin.AI_ASSISTED


def test_human_without_attribution_trailers() -> None:
    assert classify_origin(_commit("Alice")) is CommitOrigin.HUMAN


def test_human_name_containing_bot_substring_not_misclassified() -> None:
    # "Abbott" contains "bot" but not as `-bot` or `[bot]`. Must stay HUMAN.
    assert classify_origin(_commit("Abbott")) is CommitOrigin.HUMAN


def test_copilot_co_author_is_ai_assisted() -> None:
    c = _commit("Alice", attribution_trailers=["copilot@users.noreply.github.com"])
    assert classify_origin(c) is CommitOrigin.AI_ASSISTED


def _release_commit(author: str, message: str) -> Commit:
    return Commit(hash="deadbeef", author=author, message=message)


def test_ci_release_commit_under_human_actor_is_bot() -> None:
    # Regression: release pipelines that commit as $GITHUB_ACTOR (the person
    # who merged) produced one HUMAN commit per merge, dragging repos that are
    # 100% AI-assisted down to ~60%.
    c = _release_commit("p-beltrani", "chore: release v0.1.10 [skip ci]")
    assert classify_origin(c) is CommitOrigin.BOT


def test_semantic_release_default_message_is_bot() -> None:
    # semantic-release's default subject, when run under a personal token.
    c = _release_commit("Alice", "chore(release): 1.4.0 [skip ci]")
    assert classify_origin(c) is CommitOrigin.BOT


def test_release_prerelease_version_is_bot() -> None:
    c = _release_commit("Alice", "chore: release v2.0.0-rc.1 [skip ci]")
    assert classify_origin(c) is CommitOrigin.BOT


def test_squash_merged_release_pr_is_bot() -> None:
    # A release PR squash-merged gets the PR number appended to the subject.
    c = _release_commit("Alice", "chore(release): 1.4.0 [skip ci] (#123)")
    assert classify_origin(c) is CommitOrigin.BOT


def test_release_subject_with_free_text_after_skip_ci_stays_human() -> None:
    # Only the PR-number suffix is tolerated; anything else is a person typing.
    c = _release_commit("Alice", "chore: release v1.0.0 [skip ci] and bump deps")
    assert classify_origin(c) is CommitOrigin.HUMAN


def test_hand_written_release_commit_stays_human() -> None:
    # Without [skip ci] it is a person cutting a release, not the pipeline.
    c = _release_commit("Alice", "chore(release): v1.8.0 — metrics parity gate")
    assert classify_origin(c) is CommitOrigin.HUMAN


def test_skip_ci_on_regular_commit_stays_human() -> None:
    c = _release_commit("Alice", "docs: fix typo in readme [skip ci]")
    assert classify_origin(c) is CommitOrigin.HUMAN


def test_release_subject_with_ai_trailer_stays_ai_assisted() -> None:
    c = Commit(
        hash="deadbeef",
        author="Alice",
        message="chore: release v1.0.0 [skip ci]",
        attribution_trailers=["Claude Code <noreply@anthropic.com>"],
    )
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
