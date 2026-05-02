"""Heuristic intent classifier — deterministic commit classification by intent.

Classifies each commit into one of five categories:
FEATURE, FIX, REFACTOR, CONFIG, UNKNOWN.

Heuristic priority (first match wins):
1. Conventional Commit prefix (feat:, fix:, refactor:, chore:, etc.)
2. Keyword detection in commit message
3. File type heuristic (100% config files → CONFIG)
4. Fallback → UNKNOWN

Rules:
- Case-insensitive matching
- Deterministic: same input always produces same output
- Explainable: confidence_reason documents which rule matched
- No ML, NLP, or external APIs
"""

import re

from iris.models.commit import Commit
from iris.models.intent import ChangeIntent, ClassifiedCommit

# --- Heuristic 1: Conventional Commit prefixes ---
# Ordered by specificity. Checked against lowercased message.
# Format: (prefix_pattern, intent)
_PREFIX_RULES: list[tuple[re.Pattern, ChangeIntent]] = [
    (re.compile(r"^feat(?:ure)?(?:\(.+?\))?:\s", re.IGNORECASE), ChangeIntent.FEATURE),
    (re.compile(r"^(?:fix|bugfix|hotfix)(?:\(.+?\))?:\s", re.IGNORECASE), ChangeIntent.FIX),
    (re.compile(r"^refact(?:or)?(?:\(.+?\))?:\s", re.IGNORECASE), ChangeIntent.REFACTOR),
    (re.compile(r"^(?:chore|build|ci|config)(?:\(.+?\))?:\s", re.IGNORECASE), ChangeIntent.CONFIG),
]

# --- Heuristic 2: Keyword detection ---
# Checked as whole-word matches in the lowercased message.
# Format: (keyword_pattern, intent)
_KEYWORD_RULES: list[tuple[re.Pattern, ChangeIntent]] = [
    # FIX keywords checked first — "fix" is very common and specific
    (re.compile(r"\b(?:fix|bug|patch|resolve)\b", re.IGNORECASE), ChangeIntent.FIX),
    (re.compile(r"close\s+#\d+", re.IGNORECASE), ChangeIntent.FIX),
    # FEATURE keywords
    (re.compile(r"\b(?:add|implement|new)\b", re.IGNORECASE), ChangeIntent.FEATURE),
    # REFACTOR keywords
    (re.compile(r"\b(?:refactor|rename|move|extract|simplify)\b", re.IGNORECASE), ChangeIntent.REFACTOR),
    # CONFIG keywords
    (re.compile(r"\b(?:config|env|yaml|toml|docker)\b", re.IGNORECASE), ChangeIntent.CONFIG),
]

# --- Heuristic 3: Config file extensions/names ---
_CONFIG_FILES = frozenset({
    "dockerfile", ".dockerignore", ".gitignore", "makefile",
    ".editorconfig", ".prettierrc", ".eslintrc",
})

_CONFIG_EXTENSIONS = frozenset({
    ".yml", ".yaml", ".toml", ".json", ".env", ".ini",
    ".cfg", ".conf", ".properties",
})


def classify_commit(commit: Commit) -> ClassifiedCommit:
    """Classify a single commit by engineering intent.

    Applies heuristics in priority order. First match wins.

    Args:
        commit: A Commit object with message and file changes.

    Returns:
        ClassifiedCommit with intent and the reason that matched.
    """
    msg = commit.message

    # Heuristic 1: Conventional Commit prefix
    for pattern, intent in _PREFIX_RULES:
        if pattern.search(msg):
            return ClassifiedCommit(
                commit=commit,
                intent=intent,
                confidence_reason=f"prefix:{pattern.pattern}",
            )

    # Heuristic 2: Keyword detection
    for pattern, intent in _KEYWORD_RULES:
        match = pattern.search(msg)
        if match:
            return ClassifiedCommit(
                commit=commit,
                intent=intent,
                confidence_reason=f"keyword:{match.group()}",
            )

    # Heuristic 3: File type heuristic (all files are config → CONFIG)
    if commit.files and _all_config_files(commit):
        return ClassifiedCommit(
            commit=commit,
            intent=ChangeIntent.CONFIG,
            confidence_reason="filetype:all_config",
        )

    # Heuristic 4: Fallback
    return ClassifiedCommit(
        commit=commit,
        intent=ChangeIntent.UNKNOWN,
        confidence_reason="fallback:no_match",
    )


def classify_commits(commits: list[Commit]) -> list[ClassifiedCommit]:
    """Classify a batch of commits by engineering intent.

    Args:
        commits: List of Commit objects.

    Returns:
        List of ClassifiedCommit in the same order.
    """
    return [classify_commit(c) for c in commits]


def _all_config_files(commit: Commit) -> bool:
    """Check if every file in the commit is a config file."""
    for fc in commit.files:
        name = fc.path.rsplit("/", 1)[-1].lower()
        if name in _CONFIG_FILES:
            continue
        ext = ""
        dot_pos = name.rfind(".")
        if dot_pos >= 0:
            ext = name[dot_pos:]
        if ext in _CONFIG_EXTENSIONS:
            continue
        return False
    return True
