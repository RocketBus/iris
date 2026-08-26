"""Regression tests for attribution trailer ingestion and AI tool detection.

Covers the three trailer keys the engine reads (`Co-authored-by`,
`Assisted-by`, `Made-with`) end to end: from a raw `git log` body through
`_parse_log_output` into `classify_origin` / `detect_tool`.

Runnable as a plain script: `python tests/test_attribution_trailers.py`.
No external test framework required.
"""

import sys
from pathlib import Path

# Allow running from repo root without installation.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.analysis.origin_classifier import (
    CommitOrigin,
    classify_origin,
    detect_tool,
)
from iris.ingestion.git_reader import _parse_log_output
from iris.models.commit import Commit

_FIELD_SEP = "<<<SEP>>>"
_COMMIT_SEP = "<<<COMMIT>>>"


def _log_output(body: str, author: str = "Alice") -> str:
    """Build a `git log` chunk in the format read_commits() requests."""
    fields = [
        "abc123",
        author,
        "alice@example.com",
        "2026-01-15T10:00:00+00:00",
        "parent1",
        "feat: add payment validation",
        body,
    ]
    return _FIELD_SEP.join(fields) + _COMMIT_SEP


def _parse_one(body: str, author: str = "Alice") -> Commit:
    commits = _parse_log_output(_log_output(body, author), include_merges=False)
    assert len(commits) == 1, f"expected 1 commit, got {len(commits)}"
    return commits[0]


# --- Ingestion: which trailers get read out of the commit body ---


def test_co_authored_by_is_parsed() -> None:
    c = _parse_one("Co-Authored-By: Claude Code <noreply@anthropic.com>")
    assert c.attribution_trailers == ["Claude Code <noreply@anthropic.com>"]


def test_assisted_by_is_parsed() -> None:
    # ClickBus RFC 0020 writes Assisted-by instead of Co-Authored-By, so
    # before this was read those commits were classified as HUMAN.
    c = _parse_one("Assisted-by: Claude Code <noreply@anthropic.com>")
    assert c.attribution_trailers == ["Claude Code <noreply@anthropic.com>"]


def test_made_with_without_email_is_parsed() -> None:
    # Cursor's agent writes a bare tool name with no <email> part.
    c = _parse_one("Made-with: Cursor")
    assert c.attribution_trailers == ["Cursor"]


def test_trailer_key_is_case_insensitive() -> None:
    c = _parse_one("assisted-BY: Claude Code <noreply@anthropic.com>")
    assert c.attribution_trailers == ["Claude Code <noreply@anthropic.com>"]


def test_indented_trailer_is_not_parsed() -> None:
    # Git only honours trailers at column 0.
    c = _parse_one("  Co-authored-by: Devin AI <devin@example.com>")
    assert c.attribution_trailers == []


def test_crlf_body_does_not_leak_carriage_return() -> None:
    c = _parse_one("Assisted-by: Claude Code <noreply@anthropic.com>\r\n")
    assert c.attribution_trailers == ["Claude Code <noreply@anthropic.com>"]


def test_multiple_trailers_are_all_parsed() -> None:
    body = (
        "Some description\n"
        "\n"
        "Co-authored-by: Bob <bob@example.com>\n"
        "Assisted-by: Claude Code <noreply@anthropic.com>\n"
    )
    c = _parse_one(body)
    assert c.attribution_trailers == [
        "Bob <bob@example.com>",
        "Claude Code <noreply@anthropic.com>",
    ]


def test_body_without_trailers_yields_none() -> None:
    c = _parse_one("Just a plain description.\n")
    assert c.attribution_trailers == []


def test_trailer_mid_sentence_is_not_parsed() -> None:
    # Prose mentioning the trailer must not count as attribution.
    c = _parse_one("Docs now explain Co-authored-by: Claude <c@example.com>\n")
    assert c.attribution_trailers == []


def test_empty_trailer_value_is_not_parsed() -> None:
    c = _parse_one("Co-Authored-By:\n")
    assert c.attribution_trailers == []


# --- Classification: trailer value → origin and tool ---


def _commit(*trailers: str, author: str = "Alice") -> Commit:
    return Commit(hash="deadbeef", author=author, attribution_trailers=list(trailers))


def test_assisted_by_claude_is_ai_assisted() -> None:
    c = _commit("Claude Code <noreply@anthropic.com>")
    assert classify_origin(c) is CommitOrigin.AI_ASSISTED
    assert detect_tool(c) == "Claude"


def test_made_with_cursor_is_ai_assisted() -> None:
    c = _commit("Cursor")
    assert classify_origin(c) is CommitOrigin.AI_ASSISTED
    assert detect_tool(c) == "Cursor"


def test_devin_is_detected() -> None:
    # Devin's integration co-authors as a bracketed bot account. The [bot]
    # suffix only rules the *author* field, so without a tool pattern these
    # commits fell through to HUMAN.
    trailers = (
        "Devin AI <158243242+devin-ai-integration[bot]@users.noreply.github.com>",
        "devin-ai-integration[bot] "
        "<158243242+devin-ai-integration[bot]@users.noreply.github.com>",
    )
    for trailer in trailers:
        c = _commit(trailer)
        assert classify_origin(c) is CommitOrigin.AI_ASSISTED, trailer
        assert detect_tool(c) == "Devin", trailer


def test_tool_name_in_display_name_only_is_detected() -> None:
    # The tool name lives in either half of the trailer depending on the
    # tool, so the whole value is matched — not just the e-mail.
    c = _commit("Cursor Agent <noreply@github.com>")
    assert classify_origin(c) is CommitOrigin.AI_ASSISTED
    assert detect_tool(c) == "Cursor"


def test_bare_email_still_detected() -> None:
    # Backward compatibility: callers that hand over just the e-mail.
    c = _commit("copilot@users.noreply.github.com")
    assert classify_origin(c) is CommitOrigin.AI_ASSISTED
    assert detect_tool(c) == "Copilot"


def test_agent_name_with_underscore_is_detected() -> None:
    # The hook forwards `$AI_AGENT` only lowercased, so an agent named
    # `claude_code` keeps its underscore — which `\b` reads as a word
    # character, not a boundary.
    c = _commit("claude_code <claude_code@iris.invalid>")
    assert classify_origin(c) is CommitOrigin.AI_ASSISTED
    assert detect_tool(c) == "Claude"


def test_human_co_author_stays_human() -> None:
    c = _commit("Bob Souza <bob@example.com>")
    assert classify_origin(c) is CommitOrigin.HUMAN
    assert detect_tool(c) is None


def test_human_name_containing_tool_substring_stays_human() -> None:
    # Tool names are matched as whole words, so a human co-author whose name
    # merely contains one is not attributed to an AI.
    names = (
        "Claudemir Santos <c.santos@corp.com>",
        "Claudete Rocha <claudete@corp.com>",
        "Geminiano Silva <g.silva@corp.com>",
        "Devin Kelly <devin.kelly@corp.com>",
    )
    for name in names:
        c = _commit(name)
        assert classify_origin(c) is CommitOrigin.HUMAN, name
        assert detect_tool(c) is None, name


def test_first_ai_trailer_wins_over_human_one() -> None:
    c = _commit("Bob <bob@example.com>", "Claude Code <noreply@anthropic.com>")
    assert classify_origin(c) is CommitOrigin.AI_ASSISTED
    assert detect_tool(c) == "Claude"


def test_end_to_end_assisted_by_commit_is_ai() -> None:
    c = _parse_one("Assisted-by: Claude Code <noreply@anthropic.com>")
    assert classify_origin(c) is CommitOrigin.AI_ASSISTED
    assert detect_tool(c) == "Claude"


def test_end_to_end_plain_commit_is_human() -> None:
    c = _parse_one("Nothing to attribute here.\n")
    assert classify_origin(c) is CommitOrigin.HUMAN


if __name__ == "__main__":
    tests = [fn for name, fn in globals().items() if name.startswith("test_")]
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"ok  {fn.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {fn.__name__}: {exc}")
    if failed:
        print(f"\n{failed} failure(s)")
        sys.exit(1)
    print(f"\n{len(tests)} tests passed")
