"""Code durability — measure how long lines survive before rewrite, by origin.

Uses git blame on files modified during the analysis window to attribute
surviving lines to their introducing commits, then cross-references with
origin classification to compare AI vs Human line survival.

Key metrics:
- Survival rate: % of introduced lines that still exist at HEAD
- Median line age: how old are the surviving lines (days)
- Both segmented by origin (HUMAN, AI_ASSISTED)

Performance:
- Only blames files modified by 2+ commits (churning files are interesting)
- Caps at MAX_FILES_TO_BLAME to keep runtime bounded
- Each blame call has a timeout
"""

# AGGREGATOR_OPT_OUT: requires git blame I/O against the repo path.
# Aggregator operates on commit lists only; kept outside to preserve that boundary.
# Consumers: iris/cli.py (Step 4c)

import re
import subprocess
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import median

from iris.analysis.origin_classifier import CommitOrigin
from iris.models.commit import Commit


@dataclass(frozen=True)
class DurabilityByOrigin:
    """Durability metrics for a single origin."""

    origin: str
    lines_introduced: int      # lines_added by commits of this origin
    lines_surviving: int       # lines attributed to this origin in blame at HEAD
    survival_rate: float       # lines_surviving / lines_introduced
    median_age_days: float     # median age of surviving lines


@dataclass(frozen=True)
class DurabilityByTool:
    """Durability metrics for a specific AI tool."""

    tool: str
    lines_introduced: int
    lines_surviving: int
    survival_rate: float
    median_age_days: float


@dataclass(frozen=True)
class DurabilityResult:
    """Complete code durability analysis."""

    files_analyzed: int
    total_lines_in_blame: int          # total lines attributed to window commits
    by_origin: list[DurabilityByOrigin]
    by_tool: list[DurabilityByTool] = field(default_factory=list)


# Maximum files to run git blame on (performance bound).
MAX_FILES_TO_BLAME = 50

# Minimum lines introduced per origin to report metrics.
MIN_LINES_PER_ORIGIN = 20

# Timeout per blame call in seconds.
BLAME_TIMEOUT_SECONDS = 15


def calculate_durability(
    repo_path: str,
    commits: list[Commit],
    origin_classified: list[tuple[Commit, CommitOrigin]],
    tool_map: dict[str, str] | None = None,
) -> DurabilityResult | None:
    """Calculate code durability by origin and AI tool using git blame.

    Args:
        repo_path: Absolute path to the Git repository.
        commits: Commits sorted by date ascending (analysis window).
        origin_classified: Pre-classified (commit, origin) pairs.
        tool_map: Optional commit hash -> tool name mapping from build_tool_map().

    Returns:
        DurabilityResult with per-origin and per-tool survival metrics,
        or None if insufficient data.
    """
    if len(commits) < 2:
        return None

    # Build lookup maps
    origin_map = {c.hash: origin.value for c, origin in origin_classified}
    commit_dates = {c.hash: c.date for c in commits}
    window_hashes = set(c.hash for c in commits)

    # Find files modified by 2+ commits (interesting for durability)
    file_commit_count: dict[str, int] = defaultdict(int)
    file_lines_by_origin: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for commit in commits:
        if commit.is_merge:
            continue
        origin = origin_map.get(commit.hash, CommitOrigin.HUMAN.value)
        seen_files: set[str] = set()
        for fc in commit.files:
            if fc.path not in seen_files:
                file_commit_count[fc.path] += 1
                seen_files.add(fc.path)
            file_lines_by_origin[fc.path][origin] += fc.lines_added

    # Select files: modified by 2+ commits, capped at MAX_FILES_TO_BLAME
    # Prioritize files with most commits (most interesting for durability)
    multi_touch_files = [
        (path, count) for path, count in file_commit_count.items()
        if count >= 2
    ]
    multi_touch_files.sort(key=lambda x: -x[1])
    files_to_blame = [path for path, _ in multi_touch_files[:MAX_FILES_TO_BLAME]]

    if not files_to_blame:
        return None

    # Run git blame on selected files and collect line attributions
    now = datetime.now(timezone.utc)
    origin_lines_surviving: dict[str, int] = defaultdict(int)
    origin_line_ages: dict[str, list[float]] = defaultdict(list)
    tool_lines_surviving: dict[str, int] = defaultdict(int)
    tool_line_ages: dict[str, list[float]] = defaultdict(list)
    total_window_lines = 0
    files_analyzed = 0

    for file_path in files_to_blame:
        blame_lines = _run_blame(repo_path, file_path)
        if blame_lines is None:
            continue

        files_analyzed += 1

        for commit_hash in blame_lines:
            # Only count lines from commits in our analysis window
            short_match = _find_window_hash(commit_hash, window_hashes)
            if short_match is None:
                continue

            origin = origin_map.get(short_match, CommitOrigin.HUMAN.value)
            origin_lines_surviving[origin] += 1
            total_window_lines += 1

            # Compute age of this line
            commit_date = commit_dates.get(short_match)
            age_days = None
            if commit_date:
                age_days = (now - commit_date).total_seconds() / 86400
                origin_line_ages[origin].append(age_days)

            # Tool-level tracking
            if tool_map:
                tool = tool_map.get(short_match)
                if tool:
                    tool_lines_surviving[tool] += 1
                    if age_days is not None:
                        tool_line_ages[tool].append(age_days)

    if total_window_lines == 0 or files_analyzed == 0:
        return None

    # Compute lines introduced per origin (from numstat, across blamed files only)
    origin_lines_introduced: dict[str, int] = defaultdict(int)
    tool_lines_introduced: dict[str, int] = defaultdict(int)
    for file_path in files_to_blame[:files_analyzed]:
        for origin, lines in file_lines_by_origin.get(file_path, {}).items():
            origin_lines_introduced[origin] += lines

    # Compute tool-level introduced lines
    if tool_map:
        for commit in commits:
            if commit.is_merge:
                continue
            tool = tool_map.get(commit.hash)
            if tool:
                for fc in commit.files:
                    if fc.path in files_to_blame[:files_analyzed]:
                        tool_lines_introduced[tool] += fc.lines_added

    # Build per-origin results
    by_origin: list[DurabilityByOrigin] = []
    for origin in [CommitOrigin.HUMAN.value, CommitOrigin.AI_ASSISTED.value]:
        introduced = origin_lines_introduced.get(origin, 0)
        surviving = origin_lines_surviving.get(origin, 0)

        if introduced < MIN_LINES_PER_ORIGIN:
            continue

        survival_rate = min(surviving / introduced, 1.0) if introduced > 0 else 0.0
        ages = origin_line_ages.get(origin, [])
        med_age = median(ages) if ages else 0.0

        by_origin.append(DurabilityByOrigin(
            origin=origin,
            lines_introduced=introduced,
            lines_surviving=surviving,
            survival_rate=round(survival_rate, 3),
            median_age_days=round(med_age, 1),
        ))

    if not by_origin:
        return None

    # Build per-tool results
    by_tool: list[DurabilityByTool] = []
    if tool_map:
        for tool in sorted(tool_lines_introduced.keys()):
            introduced = tool_lines_introduced.get(tool, 0)
            surviving = tool_lines_surviving.get(tool, 0)

            if introduced < MIN_LINES_PER_ORIGIN:
                continue

            survival_rate = min(surviving / introduced, 1.0) if introduced > 0 else 0.0
            ages = tool_line_ages.get(tool, [])
            med_age = median(ages) if ages else 0.0

            by_tool.append(DurabilityByTool(
                tool=tool,
                lines_introduced=introduced,
                lines_surviving=surviving,
                survival_rate=round(survival_rate, 3),
                median_age_days=round(med_age, 1),
            ))

    return DurabilityResult(
        files_analyzed=files_analyzed,
        total_lines_in_blame=total_window_lines,
        by_origin=by_origin,
        by_tool=by_tool,
    )


def _run_blame(repo_path: str, file_path: str) -> list[str] | None:
    """Run git blame on a file and return a list of commit hashes (one per line).

    Returns None if the file doesn't exist or blame fails.
    """
    try:
        result = subprocess.run(
            [
                "git", "-C", repo_path, "blame",
                "--porcelain", "--", file_path,
            ],
            capture_output=True,
            text=True,
            timeout=BLAME_TIMEOUT_SECONDS,
        )
        if result.returncode != 0:
            return None

        return _parse_porcelain_blame(result.stdout)
    except (subprocess.TimeoutExpired, Exception):
        return None


# Porcelain blame: each line block starts with a 40-char hash
_HASH_LINE_RE = re.compile(r"^([0-9a-f]{40})\s+\d+\s+\d+")


def _parse_porcelain_blame(output: str) -> list[str]:
    """Parse git blame --porcelain output into a list of commit hashes.

    Each content line in the file maps to exactly one commit hash.
    The porcelain format outputs a header block per line; we extract
    the commit hash from lines matching the hash pattern.
    """
    hashes = []
    for line in output.split("\n"):
        m = _HASH_LINE_RE.match(line)
        if m:
            hashes.append(m.group(1))
    return hashes


def _find_window_hash(blame_hash: str, window_hashes: set[str]) -> str | None:
    """Match a blame hash (always 40 chars) against window commit hashes.

    Window hashes may be abbreviated. Returns the matching window hash
    or None if no match.
    """
    if blame_hash in window_hashes:
        return blame_hash

    # Window hashes might be abbreviated (e.g. 7-char from git log)
    for wh in window_hashes:
        if blame_hash.startswith(wh) or wh.startswith(blame_hash):
            return wh

    return None
