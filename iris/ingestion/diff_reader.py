"""Diff reader — parse actual line content from git show for code quality analysis.

Provides the raw diff data needed by duplicate detection, move detection,
and operation classification. Each commit's diff is parsed into per-file
added and removed line content.

Performance:
- Caps at MAX_COMMITS_TO_DIFF commits (most recent non-merge first)
- Caps at MAX_FILES_PER_COMMIT files per commit
- Each git show call has a timeout
- Uses --unified=0 to minimize output (only changed lines, no context)
"""

import re
import subprocess
from dataclasses import dataclass

from iris.models.commit import Commit


@dataclass(frozen=True)
class FileDiff:
    """Parsed diff content for a single file in a commit."""

    path: str
    added_lines: tuple[str, ...]    # line content without leading '+'
    removed_lines: tuple[str, ...]  # line content without leading '-'


@dataclass(frozen=True)
class CommitDiff:
    """Parsed diff content for an entire commit."""

    commit_hash: str
    file_diffs: tuple[FileDiff, ...]


# Performance bounds.
MAX_COMMITS_TO_DIFF = 200
MAX_FILES_PER_COMMIT = 30
DIFF_TIMEOUT_SECONDS = 15

# Regex to extract file path from diff header.
_DIFF_HEADER_RE = re.compile(r"^diff --git a/.+ b/(.+)$", re.MULTILINE)

# Lines that are too trivial to count in duplicate/move detection.
_TRIVIAL_TOKENS = frozenset([
    "", "{", "}", "(", ")", "[", "]", "end", "else", "else:",
    "pass", "return", "break", "continue", "fi", "done", "esac",
    "then", "do", "begin", "end;", "end.", "});", "});",
    "});", "});", "*/", "/*", "<!--", "-->",
])


def _is_trivial_line(line: str) -> bool:
    """Check if a line is trivial (whitespace-only, single brace/keyword)."""
    stripped = line.strip()
    if not stripped:
        return True
    # Single-token trivial lines
    if stripped in _TRIVIAL_TOKENS:
        return True
    # Lines that are only punctuation/braces
    if all(c in "{}()[];,:" for c in stripped):
        return True
    return False


def read_commit_diff(repo_path: str, commit_hash: str) -> CommitDiff | None:
    """Run git show for a single commit and parse the diff.

    Returns None if the command fails or times out.
    """
    try:
        result = subprocess.run(
            [
                "git", "-C", repo_path, "show", commit_hash,
                "--unified=0", "--no-color", "--format=",
            ],
            capture_output=True,
            text=True,
            timeout=DIFF_TIMEOUT_SECONDS,
        )
        if result.returncode != 0:
            return None

        return _parse_unified_diff(result.stdout, commit_hash)
    except (subprocess.TimeoutExpired, Exception):
        return None


def read_commit_diffs(
    repo_path: str,
    commits: list[Commit],
    max_commits: int = MAX_COMMITS_TO_DIFF,
) -> list[CommitDiff]:
    """Read diffs for a batch of commits, capped at max_commits.

    Selects the most recent non-merge commits. Skips commits where
    git show fails or times out.
    """
    # Filter non-merge commits, most recent first
    candidates = [c for c in commits if not c.is_merge and c.files]
    candidates.sort(key=lambda c: c.date, reverse=True)
    candidates = candidates[:max_commits]

    diffs: list[CommitDiff] = []
    for commit in candidates:
        diff = read_commit_diff(repo_path, commit.hash)
        if diff is not None and diff.file_diffs:
            diffs.append(diff)

    return diffs


def _parse_unified_diff(raw: str, commit_hash: str) -> CommitDiff:
    """Parse raw git show --unified=0 output into a CommitDiff."""
    # Split on file boundaries
    file_sections = re.split(r"^diff --git ", raw, flags=re.MULTILINE)

    file_diffs: list[FileDiff] = []

    for section in file_sections:
        if not section.strip():
            continue

        # Extract file path from header: "a/path b/path"
        first_line = section.split("\n", 1)[0]
        parts = first_line.split(" b/", 1)
        if len(parts) < 2:
            continue
        path = parts[1].strip()

        # Skip binary files
        if "Binary files" in section:
            continue

        added: list[str] = []
        removed: list[str] = []

        for line in section.split("\n"):
            if line.startswith("+") and not line.startswith("+++"):
                added.append(line[1:])
            elif line.startswith("-") and not line.startswith("---"):
                removed.append(line[1:])

        if added or removed:
            file_diffs.append(FileDiff(
                path=path,
                added_lines=tuple(added),
                removed_lines=tuple(removed),
            ))

        if len(file_diffs) >= MAX_FILES_PER_COMMIT:
            break

    return CommitDiff(
        commit_hash=commit_hash,
        file_diffs=tuple(file_diffs),
    )
