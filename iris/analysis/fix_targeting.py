"""Fix targeting — which origin's code attracts the most bug fixes?

For each FIX commit, identifies the files touched and attributes them to
the origin of the most recent non-fix commit that modified each file.
This answers: "does AI-authored code attract a disproportionate share of
bug fixes?"

Key metric: if AI wrote 30% of commits but attracts 50% of fixes,
that's a strong signal that AI code causes more problems.

Attribution: the fix targets the INTRODUCING commit's origin — the
last non-fix commit that touched the same file before the fix.
"""

from collections import defaultdict
from dataclasses import dataclass, field

from iris.analysis.intent_classifier import classify_commit
from iris.models.commit import Commit
from iris.models.intent import ChangeIntent


@dataclass(frozen=True)
class FixTargetByOrigin:
    """Fix targeting for a single origin."""

    origin: str
    fixes_attracted: int        # number of fix events targeting this origin's code
    code_share_pct: float       # % of non-fix commits from this origin
    fix_share_pct: float        # % of fix events targeting this origin's code
    disproportionality: float   # fix_share / code_share (>1 means overrepresented)


@dataclass(frozen=True)
class FixTargetByTool:
    """Fix targeting for a specific AI tool."""

    tool: str
    fixes_attracted: int


@dataclass(frozen=True)
class FixTargetResult:
    """Complete fix targeting analysis."""

    total_fix_events: int           # total file-level fix targets
    total_targeted_files: int       # unique files targeted by fixes
    by_origin: list[FixTargetByOrigin]
    by_tool: list[FixTargetByTool] = field(default_factory=list)


# Minimum fix events to report results.
MIN_FIX_EVENTS = 5


def calculate_fix_targeting(
    commits: list[Commit],
    origin_map: dict[str, str],
    tool_map: dict[str, str] | None = None,
) -> FixTargetResult | None:
    """Calculate which origin's code attracts the most bug fixes.

    For each file touched by a FIX commit, looks backward to find the
    most recent non-fix commit that modified the same file, and attributes
    the fix to that commit's origin.

    Args:
        commits: All commits sorted by date ascending.
        origin_map: {commit_hash: origin_value} for all commits.
        tool_map: Optional {commit_hash: tool_name} for AI commits.

    Returns:
        FixTargetResult, or None if insufficient fix events.
    """
    if len(commits) < 2:
        return None

    # Classify intents
    intent_map: dict[str, ChangeIntent] = {}
    for commit in commits:
        classified = classify_commit(commit)
        intent_map[commit.hash] = classified.intent

    # Build per-file history: path -> [(hash, is_fix)] in chronological order
    file_history: dict[str, list[tuple[str, bool]]] = defaultdict(list)
    for commit in commits:
        if commit.is_merge:
            continue
        is_fix = intent_map.get(commit.hash) == ChangeIntent.FIX
        for fc in commit.files:
            file_history[fc.path].append((commit.hash, is_fix))

    # For each fix event, find what origin's code it's fixing
    origin_fix_counts: dict[str, int] = defaultdict(int)
    tool_fix_counts: dict[str, int] = defaultdict(int)
    total_fix_events = 0
    targeted_files: set[str] = set()

    for path, history in file_history.items():
        for i, (commit_hash, is_fix) in enumerate(history):
            if not is_fix:
                continue

            # Look backward for the most recent non-fix commit on this file
            introducing_origin = None
            introducing_hash = None
            for j in range(i - 1, -1, -1):
                prev_hash, prev_is_fix = history[j]
                if not prev_is_fix:
                    introducing_hash = prev_hash
                    introducing_origin = origin_map.get(prev_hash)
                    break

            if introducing_origin:
                origin_fix_counts[introducing_origin] += 1
                total_fix_events += 1
                targeted_files.add(path)

                if tool_map and introducing_hash:
                    tool = tool_map.get(introducing_hash)
                    if tool:
                        tool_fix_counts[tool] += 1

    if total_fix_events < MIN_FIX_EVENTS:
        return None

    # Compute code share (% of non-fix commits per origin)
    origin_commit_counts: dict[str, int] = defaultdict(int)
    for commit in commits:
        if commit.is_merge:
            continue
        if intent_map.get(commit.hash) == ChangeIntent.FIX:
            continue
        origin = origin_map.get(commit.hash)
        if origin:
            origin_commit_counts[origin] += 1
    total_non_fix = sum(origin_commit_counts.values())

    # Build per-origin results
    by_origin: list[FixTargetByOrigin] = []
    for origin in ["HUMAN", "AI_ASSISTED"]:
        fixes = origin_fix_counts.get(origin, 0)
        code_commits = origin_commit_counts.get(origin, 0)
        code_share = code_commits / total_non_fix if total_non_fix > 0 else 0.0
        fix_share = fixes / total_fix_events if total_fix_events > 0 else 0.0
        disproportionality = fix_share / code_share if code_share > 0 else 0.0

        by_origin.append(FixTargetByOrigin(
            origin=origin,
            fixes_attracted=fixes,
            code_share_pct=round(code_share, 3),
            fix_share_pct=round(fix_share, 3),
            disproportionality=round(disproportionality, 2),
        ))

    # Build per-tool results
    by_tool: list[FixTargetByTool] = []
    if tool_map:
        for tool in sorted(tool_fix_counts.keys()):
            by_tool.append(FixTargetByTool(
                tool=tool,
                fixes_attracted=tool_fix_counts[tool],
            ))

    return FixTargetResult(
        total_fix_events=total_fix_events,
        total_targeted_files=len(targeted_files),
        by_origin=by_origin,
        by_tool=by_tool,
    )
