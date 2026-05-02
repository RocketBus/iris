"""Revert detection — identifies commits that revert previous work.

Detection strategy (v0):
  Pattern matching on commit messages. Git-generated reverts follow
  predictable patterns like 'Revert "..."' or 'This reverts commit <hash>'.

  This is an imperfect proxy — manual reverts or squashed reverts may be
  missed. The heuristic is intentionally conservative to avoid false positives.

Assumption:
  Only message-based detection is used in v0. Diff-based detection
  (checking if a commit exactly undoes another) may be added later.
"""

import re
from collections import defaultdict
from dataclasses import dataclass, field

from iris.models.commit import Commit

# Patterns that indicate a revert commit
_REVERT_PATTERNS = [
    re.compile(r"^Revert\s+\"", re.IGNORECASE),
    re.compile(r"^Revert\s+\S", re.IGNORECASE),
    re.compile(r"This reverts commit\s+[0-9a-f]+", re.IGNORECASE),
]

# Extract the hash of the commit being reverted
_REVERTED_HASH_RE = re.compile(r"This reverts commit\s+([0-9a-f]+)", re.IGNORECASE)


@dataclass(frozen=True)
class RevertByOrigin:
    """Revert metrics for a single origin (of the reverted code)."""

    origin: str
    reverts: int
    revert_rate: float   # reverts / total commits of this origin


@dataclass(frozen=True)
class RevertByTool:
    """Revert metrics for a specific AI tool (of the reverted code)."""

    tool: str
    reverts: int


@dataclass(frozen=True)
class RevertResult:
    """Result of revert analysis on a set of commits."""

    commits_total: int
    commits_revert: int
    revert_rate: float
    revert_hashes: list[str]
    by_origin: list[RevertByOrigin] = field(default_factory=list)
    by_tool: list[RevertByTool] = field(default_factory=list)


def is_revert(commit: Commit) -> bool:
    """Check if a commit message matches known revert patterns."""
    for pattern in _REVERT_PATTERNS:
        if pattern.search(commit.message):
            return True
    return False


def extract_reverted_hash(commit: Commit) -> str | None:
    """Extract the hash of the commit being reverted, if present."""
    m = _REVERTED_HASH_RE.search(commit.message)
    return m.group(1) if m else None


def detect_reverts(
    commits: list[Commit],
    origin_map: dict[str, str] | None = None,
    tool_map: dict[str, str] | None = None,
) -> RevertResult:
    """Analyze a list of commits and calculate revert metrics.

    When origin_map and/or tool_map are provided, attributes each revert
    to the origin/tool of the commit being reverted.

    Args:
        commits: List of Commit objects (from git_reader).
        origin_map: Optional {commit_hash: origin_value} for all commits.
        tool_map: Optional {commit_hash: tool_name} for AI commits.

    Returns:
        RevertResult with counts, revert rate, and optional origin/tool breakdown.
    """
    total = len(commits)
    revert_commits = [c for c in commits if is_revert(c)]
    revert_hashes = [c.hash for c in revert_commits]
    revert_count = len(revert_hashes)

    rate = revert_count / total if total > 0 else 0.0

    by_origin: list[RevertByOrigin] = []
    by_tool: list[RevertByTool] = []

    if origin_map and revert_commits:
        # Count reverts per origin of the REVERTED commit
        origin_revert_counts: dict[str, int] = defaultdict(int)
        origin_total_counts: dict[str, int] = defaultdict(int)
        tool_revert_counts: dict[str, int] = defaultdict(int)

        # Count total commits per origin
        for origin in origin_map.values():
            origin_total_counts[origin] += 1

        for revert_commit in revert_commits:
            reverted_hash = extract_reverted_hash(revert_commit)
            if not reverted_hash:
                continue

            # Find the reverted commit's origin (handle abbreviated hashes)
            reverted_origin = _find_origin(reverted_hash, origin_map)
            if reverted_origin:
                origin_revert_counts[reverted_origin] += 1

            # Tool attribution
            if tool_map:
                reverted_tool = _find_tool(reverted_hash, tool_map)
                if reverted_tool:
                    tool_revert_counts[reverted_tool] += 1

        for origin in ["HUMAN", "AI_ASSISTED"]:
            reverts = origin_revert_counts.get(origin, 0)
            total_origin = origin_total_counts.get(origin, 0)
            if total_origin > 0:
                by_origin.append(RevertByOrigin(
                    origin=origin,
                    reverts=reverts,
                    revert_rate=round(reverts / total_origin, 4),
                ))

        for tool in sorted(tool_revert_counts.keys()):
            by_tool.append(RevertByTool(
                tool=tool,
                reverts=tool_revert_counts[tool],
            ))

    return RevertResult(
        commits_total=total,
        commits_revert=revert_count,
        revert_rate=rate,
        revert_hashes=revert_hashes,
        by_origin=by_origin,
        by_tool=by_tool,
    )


def _find_origin(reverted_hash: str, origin_map: dict[str, str]) -> str | None:
    """Match a reverted hash against the origin map (handles abbreviated hashes)."""
    if reverted_hash in origin_map:
        return origin_map[reverted_hash]
    for known_hash, origin in origin_map.items():
        if known_hash.startswith(reverted_hash) or reverted_hash.startswith(known_hash):
            return origin
    return None


def _find_tool(reverted_hash: str, tool_map: dict[str, str]) -> str | None:
    """Match a reverted hash against the tool map (handles abbreviated hashes)."""
    if reverted_hash in tool_map:
        return tool_map[reverted_hash]
    for known_hash, tool in tool_map.items():
        if known_hash.startswith(reverted_hash) or reverted_hash.startswith(known_hash):
            return tool
    return None
