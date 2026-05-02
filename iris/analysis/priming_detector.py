"""Priming doc detector — detect knowledge priming files in analyzed repositories.

Scans a repository for known AI context files (CLAUDE.md, .cursor/rules, etc.)
and determines when each was introduced via git log.

This enables correlating the presence of Knowledge Priming with stabilization
metrics — testing the hypothesis that primed repos produce more durable code.

Known priming files (ordered by specificity):
- CLAUDE.md, .claude/* — Anthropic Claude Code context
- .cursorrules, .cursor/rules — Cursor AI context
- .github/copilot-instructions.md — GitHub Copilot context
- .windsurfrules — Windsurf AI context
- CONTRIBUTING.md — general contributor guide (>500 bytes threshold)
"""

# AGGREGATOR_OPT_OUT: reads repo filesystem directly (not a commit-based analysis).
# Aggregator takes commits/PRs; filesystem-scanning analyses stay post-hoc.
# Consumers: iris/cli.py (Step 4b)

import os
import subprocess
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class PrimingFile:
    """A detected knowledge priming file in the repository."""

    path: str
    introduced_date: datetime | None  # None if git history unavailable
    size_bytes: int


@dataclass(frozen=True)
class PrimingResult:
    """Result of priming doc detection for a repository."""

    files: list[PrimingFile]
    has_priming: bool
    earliest_introduction: datetime | None  # earliest introduced_date across files


# Known priming file paths, checked in order.
KNOWN_PRIMING_PATHS = [
    "CLAUDE.md",
    ".claude",
    ".cursorrules",
    ".cursor/rules",
    ".github/copilot-instructions.md",
    ".windsurfrules",
]

# CONTRIBUTING.md is only considered priming if it exceeds this size.
# Small CONTRIBUTING.md files are typically boilerplate, not curated context.
CONTRIBUTING_MIN_BYTES = 500


def detect_priming(repo_path: str) -> PrimingResult:
    """Detect knowledge priming files in a Git repository.

    Args:
        repo_path: Absolute path to a Git repository.

    Returns:
        PrimingResult with detected files and summary.
    """
    files: list[PrimingFile] = []

    for rel_path in KNOWN_PRIMING_PATHS:
        full_path = os.path.join(repo_path, rel_path)

        if os.path.isdir(full_path):
            # For directories (e.g. .claude), check if non-empty
            dir_files = _scan_dir(repo_path, rel_path)
            files.extend(dir_files)
        elif os.path.isfile(full_path):
            size = os.path.getsize(full_path)
            intro = _get_introduction_date(repo_path, rel_path)
            files.append(PrimingFile(
                path=rel_path,
                introduced_date=intro,
                size_bytes=size,
            ))

    # CONTRIBUTING.md — only if substantial
    contrib_path = os.path.join(repo_path, "CONTRIBUTING.md")
    if os.path.isfile(contrib_path):
        size = os.path.getsize(contrib_path)
        if size >= CONTRIBUTING_MIN_BYTES:
            intro = _get_introduction_date(repo_path, "CONTRIBUTING.md")
            files.append(PrimingFile(
                path="CONTRIBUTING.md",
                introduced_date=intro,
                size_bytes=size,
            ))

    # Compute summary
    has_priming = len(files) > 0
    dates = [f.introduced_date for f in files if f.introduced_date is not None]
    earliest = min(dates) if dates else None

    return PrimingResult(
        files=files,
        has_priming=has_priming,
        earliest_introduction=earliest,
    )


def _scan_dir(repo_path: str, rel_dir: str) -> list[PrimingFile]:
    """Scan a directory for priming files (non-recursive, top-level only)."""
    full_dir = os.path.join(repo_path, rel_dir)
    results = []

    for entry in sorted(os.listdir(full_dir)):
        entry_path = os.path.join(full_dir, entry)
        if not os.path.isfile(entry_path):
            continue
        rel_path = os.path.join(rel_dir, entry)
        size = os.path.getsize(entry_path)
        intro = _get_introduction_date(repo_path, rel_path)
        results.append(PrimingFile(
            path=rel_path,
            introduced_date=intro,
            size_bytes=size,
        ))

    return results


def _get_introduction_date(repo_path: str, file_path: str) -> datetime | None:
    """Get the date when a file was first introduced via git log.

    Uses --diff-filter=A to find the commit that added the file.
    Returns None if git history is unavailable or the file was never committed.
    """
    try:
        result = subprocess.run(
            [
                "git", "-C", repo_path, "log",
                "--diff-filter=A",
                "--follow",
                "--format=%aI",
                "--", file_path,
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return None

        # Last line is the earliest (git log is newest-first)
        lines = [l.strip() for l in result.stdout.strip().split("\n") if l.strip()]
        if not lines:
            return None

        return datetime.fromisoformat(lines[-1])
    except (subprocess.TimeoutExpired, Exception):
        return None
