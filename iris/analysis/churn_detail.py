"""Churn detail — churn chains, file coupling, and top churning files.

Explains WHY destabilization happened by drilling into file-level churn:

1. Churn chains: sequence of modifications per file (feat→fix→fix→feat)
2. File coupling: pairs of files that change together frequently
3. Top churning files: ranked list with touch count and line volume

This module complements the aggregate churn/stabilization metrics by
providing actionable detail that explains the root cause.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from itertools import combinations

from iris.analysis.intent_classifier import classify_commit
from iris.analysis.origin_classifier import CommitOrigin, classify_origin
from iris.models.commit import Commit


@dataclass(frozen=True)
class ChainLink:
    """A single modification in a churn chain."""

    date: datetime
    intent: str
    origin: str
    commit_hash: str
    lines_changed: int


@dataclass(frozen=True)
class FileChurnChain:
    """Churn chain for a single file — sequence of modifications."""

    file_path: str
    touches: int
    total_lines: int
    chain: list[ChainLink]
    fix_count: int
    first_touch: datetime
    last_touch: datetime


@dataclass(frozen=True)
class FileCoupling:
    """Two files that frequently change together."""

    file_a: str
    file_b: str
    co_occurrences: int
    total_commits_a: int
    total_commits_b: int
    coupling_rate: float


@dataclass(frozen=True)
class ChurnDetailResult:
    """Complete churn investigation result."""

    top_churning_files: list[FileChurnChain]
    couplings: list[FileCoupling]


# Maximum churning files to report.
MAX_TOP_FILES = 10

# Maximum chain links to include per file.
MAX_CHAIN_LINKS = 8

# Minimum co-occurrences to report coupling.
MIN_CO_OCCURRENCES = 3

# Minimum coupling rate to report.
MIN_COUPLING_RATE = 0.50

# Maximum couplings to report.
MAX_COUPLINGS = 10

# Minimum file touches to be a "churning file" for this analysis.
MIN_TOUCHES = 3

# Test file patterns to exclude from coupling (test+source is expected coupling).
_TEST_SUFFIXES = ("_test.go", "_test.py", "_spec.rb", "_spec.js", ".test.ts",
                  ".test.js", ".test.tsx", ".spec.ts", ".spec.tsx", "Test.java")


def calculate_churn_detail(commits: list[Commit]) -> ChurnDetailResult | None:
    """Calculate detailed churn analysis: chains, coupling, and top files.

    Args:
        commits: All commits sorted by date ascending.

    Returns:
        ChurnDetailResult with top churning files and couplings,
        or None if insufficient data.
    """
    if len(commits) < 2:
        return None

    # Build per-file touch history
    file_touches: dict[str, list[ChainLink]] = defaultdict(list)
    # Build per-commit file sets (for coupling detection)
    commit_files: list[set[str]] = []

    for commit in commits:
        if commit.is_merge or not commit.files:
            continue

        intent = classify_commit(commit).intent.value
        origin = classify_origin(commit).value
        files_in_commit: set[str] = set()

        for fc in commit.files:
            lines = fc.lines_added + fc.lines_removed
            file_touches[fc.path].append(ChainLink(
                date=commit.date,
                intent=intent,
                origin=origin,
                commit_hash=commit.hash,
                lines_changed=lines,
            ))
            files_in_commit.add(fc.path)

        if files_in_commit:
            commit_files.append(files_in_commit)

    # Build top churning files
    top_files = _build_top_churning(file_touches)
    if not top_files:
        return None

    # Detect file coupling
    couplings = _detect_coupling(file_touches, commit_files)

    return ChurnDetailResult(
        top_churning_files=top_files,
        couplings=couplings,
    )


def _build_top_churning(
    file_touches: dict[str, list[ChainLink]],
) -> list[FileChurnChain]:
    """Build ranked list of top churning files with their chains."""
    candidates = []

    for path, touches in file_touches.items():
        if len(touches) < MIN_TOUCHES:
            continue

        total_lines = sum(t.lines_changed for t in touches)
        fix_count = sum(1 for t in touches if t.intent == "FIX")
        chain = touches[:MAX_CHAIN_LINKS]

        candidates.append(FileChurnChain(
            file_path=path,
            touches=len(touches),
            total_lines=total_lines,
            chain=chain,
            fix_count=fix_count,
            first_touch=touches[0].date,
            last_touch=touches[-1].date,
        ))

    # Sort by touches descending, then total_lines descending
    candidates.sort(key=lambda f: (-f.touches, -f.total_lines))
    return candidates[:MAX_TOP_FILES]


def _detect_coupling(
    file_touches: dict[str, list[ChainLink]],
    commit_files: list[set[str]],
) -> list[FileCoupling]:
    """Detect pairs of files that frequently change together."""
    # Only consider files with enough touches
    active_files = {
        path for path, touches in file_touches.items()
        if len(touches) >= MIN_TOUCHES
    }

    if len(active_files) < 2:
        return []

    # Count co-occurrences
    co_occur: dict[tuple[str, str], int] = defaultdict(int)
    file_commit_count: dict[str, int] = defaultdict(int)

    for files in commit_files:
        active_in_commit = files & active_files
        for f in active_in_commit:
            file_commit_count[f] += 1
        for a, b in combinations(sorted(active_in_commit), 2):
            # Skip test+source pairs
            if _is_test_pair(a, b):
                continue
            co_occur[(a, b)] += 1

    # Build coupling results
    couplings = []
    for (a, b), count in co_occur.items():
        if count < MIN_CO_OCCURRENCES:
            continue
        min_commits = min(file_commit_count[a], file_commit_count[b])
        rate = count / min_commits if min_commits > 0 else 0
        if rate < MIN_COUPLING_RATE:
            continue
        couplings.append(FileCoupling(
            file_a=a,
            file_b=b,
            co_occurrences=count,
            total_commits_a=file_commit_count[a],
            total_commits_b=file_commit_count[b],
            coupling_rate=round(rate, 2),
        ))

    couplings.sort(key=lambda c: (-c.coupling_rate, -c.co_occurrences))
    return couplings[:MAX_COUPLINGS]


def _is_test_pair(a: str, b: str) -> bool:
    """Check if two files are a test+source pair (expected coupling)."""
    for suffix in _TEST_SUFFIXES:
        if a.endswith(suffix) or b.endswith(suffix):
            # Check if they share the same base path
            base_a = a.rsplit("/", 1)[-1].split(".")[0].replace("_test", "").replace("_spec", "").replace("Test", "").replace(".test", "").replace(".spec", "")
            base_b = b.rsplit("/", 1)[-1].split(".")[0].replace("_test", "").replace("_spec", "").replace("Test", "").replace(".test", "").replace(".spec", "")
            if base_a == base_b:
                return True
    return False


def render_chain(chain: list[ChainLink]) -> str:
    """Render a churn chain as a compact string: feat→fix→fix→feat."""
    return " → ".join(link.intent.lower() for link in chain)
