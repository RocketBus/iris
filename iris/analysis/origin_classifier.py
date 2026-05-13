"""Commit origin classifier — determines whether a commit is human, AI-assisted, or bot.

Heuristics (first match wins):
1. Co-author patterns: copilot, claude/anthropic, cursor, codeium, tabnine, amazon-q, gemini → AI_ASSISTED
2. Author patterns: [bot], dependabot, renovate, github-actions, mergify → BOT
3. Default: HUMAN

Rules:
- Case-insensitive matching
- Deterministic: same input always produces same output
- No ML, NLP, or external APIs
"""

import re
from enum import Enum

from iris.models.commit import Commit


class CommitOrigin(Enum):
    """Origin attribution for a commit."""

    HUMAN = "HUMAN"
    AI_ASSISTED = "AI_ASSISTED"
    BOT = "BOT"


# Co-author email patterns that indicate AI assistance
_AI_CO_AUTHOR_PATTERNS = re.compile(
    r"copilot|github-copilot|claude|anthropic|cursor|codeium|tabnine|amazon-q|gemini|windsurf",
    re.IGNORECASE,
)

# Known bot names, grouped for readability. This list is a heuristic and
# expected to evolve — new CI/release bots appear often in the wild.
_BOT_NAMES: tuple[str, ...] = (
    # GitHub core
    "web-flow",
    "github-actions",
    "github-merge-queue",
    "copilot-autofix",
    # Dependency management
    "dependabot",
    "renovate",
    "greenkeeper",
    "snyk-bot",
    # CI/CD
    "jenkins",
    "travis-ci",
    "circleci",
    # Release & versioning
    "semantic-release-bot",
    "release-drafter",
    "github-release-bot",
    # Other common bots
    "allcontributors",
    "codecov",
    "sonarcloud",
    "pre-commit-ci",
    "imgbot",
    "mergify",
    # AI code reviewers (third-party SaaS)
    "kody",
    "kody-ai",
    # Org-specific assistants (extend per deployment)
    "clickbus-pai",
)

# Author name patterns that indicate bot commits. Matches:
# - any explicit name in _BOT_NAMES
# - the conventional `[bot]` suffix
# - a generic `-bot` suffix (catches unlisted bots that follow the convention)
_BOT_AUTHOR_PATTERNS = re.compile(
    r"\[bot\]|-bot\b|" + "|".join(re.escape(name) for name in _BOT_NAMES),
    re.IGNORECASE,
)


def classify_origin(commit: Commit) -> CommitOrigin:
    """Classify a commit by its origin (human, AI-assisted, or bot).

    Args:
        commit: A Commit object with author and co_authors.

    Returns:
        CommitOrigin enum value.
    """
    # Heuristic 1: co-author patterns → AI_ASSISTED
    for email in commit.co_authors:
        if _AI_CO_AUTHOR_PATTERNS.search(email):
            return CommitOrigin.AI_ASSISTED

    # Heuristic 2: author patterns → BOT
    if _BOT_AUTHOR_PATTERNS.search(commit.author):
        return CommitOrigin.BOT

    # Default: HUMAN
    return CommitOrigin.HUMAN


# Tool-specific patterns for granular AI tool identification.
# Order matters: first match wins.
_TOOL_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"copilot|github-copilot", re.IGNORECASE), "Copilot"),
    (re.compile(r"claude|anthropic", re.IGNORECASE), "Claude"),
    (re.compile(r"cursor", re.IGNORECASE), "Cursor"),
    (re.compile(r"codeium", re.IGNORECASE), "Codeium"),
    (re.compile(r"tabnine", re.IGNORECASE), "Tabnine"),
    (re.compile(r"amazon-q", re.IGNORECASE), "Amazon Q"),
    (re.compile(r"gemini", re.IGNORECASE), "Gemini"),
    (re.compile(r"windsurf", re.IGNORECASE), "Windsurf"),
]


def detect_tool(commit: Commit) -> str | None:
    """Detect the specific AI tool from a commit's co-author patterns.

    Returns the tool name (e.g. "Copilot", "Claude") or None if no AI tool
    is detected. Only meaningful when classify_origin returns AI_ASSISTED.
    """
    for email in commit.co_authors:
        for pattern, tool_name in _TOOL_PATTERNS:
            if pattern.search(email):
                return tool_name
    return None


def classify_origins(commits: list[Commit]) -> list[tuple[Commit, CommitOrigin]]:
    """Classify a batch of commits by origin.

    Args:
        commits: List of Commit objects.

    Returns:
        List of (commit, origin) tuples in the same order.
    """
    return [(c, classify_origin(c)) for c in commits]


def build_tool_map(
    classified: list[tuple[Commit, CommitOrigin]],
) -> dict[str, str]:
    """Map commit hashes to AI tool names for AI_ASSISTED commits.

    Only includes commits where a tool was detected. Used to avoid
    redundant detect_tool() calls across analysis modules.

    Args:
        classified: Pre-classified (commit, origin) pairs.

    Returns:
        Dict mapping commit hash to tool name (e.g. "Copilot", "Claude").
    """
    result: dict[str, str] = {}
    for commit, origin in classified:
        if origin == CommitOrigin.AI_ASSISTED:
            tool = detect_tool(commit)
            if tool:
                result[commit.hash] = tool
    return result
