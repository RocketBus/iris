"""Commit shape analysis — structural profile of changes by origin.

Quantifies the "shape" of commits: how many files, how many lines per file,
how spread across directories. Compares profiles by origin to reveal
structural differences between human and AI-generated code.

Shape classification:
- Focused: few files, many lines/file (deep change in specific area)
- Spread: many files, few lines/file (wide & shallow — typical AI scaffolding)
- Bulk: many files, many lines/file (large refactor or feature)
- Surgical: few files, few lines (point fix, config change)

Thresholds use median values across all commits as the dividing line.
"""

from collections import defaultdict
from os.path import dirname
from statistics import median

from iris.analysis.origin_classifier import CommitOrigin
from iris.models.commit import Commit
from iris.models.commit_shape import ShapeProfile, ShapeResult

# Minimum commits per origin to produce a profile.
MIN_COMMITS_FOR_PROFILE = 10


def analyze_commit_shapes(
    commits: list[Commit],
    classified: list[tuple[Commit, CommitOrigin]],
) -> ShapeResult | None:
    """Analyze commit shapes and produce per-origin profiles.

    Args:
        commits: All commits sorted by date ascending.
        classified: Origin-classified commits from classify_origins().

    Returns:
        ShapeResult, or None if no non-merge commits.
    """
    origin_map = {c.hash: origin.value for c, origin in classified}

    # Compute per-commit shape metrics (exclude merges and empty commits)
    shapes: list[dict] = []
    for c in commits:
        if c.is_merge or not c.files:
            continue
        shape = _compute_shape(c, origin_map.get(c.hash, CommitOrigin.HUMAN.value))
        shapes.append(shape)

    if not shapes:
        return None

    # Overall profile
    overall = _build_profile("ALL", shapes)

    # Per-origin profiles
    grouped: dict[str, list[dict]] = defaultdict(list)
    for s in shapes:
        grouped[s["origin"]].append(s)

    profiles = []
    for origin in [CommitOrigin.HUMAN.value, CommitOrigin.AI_ASSISTED.value, CommitOrigin.BOT.value]:
        origin_shapes = grouped.get(origin, [])
        if len(origin_shapes) >= MIN_COMMITS_FOR_PROFILE:
            profiles.append(_build_profile(origin, origin_shapes))

    return ShapeResult(
        overall_profile=overall,
        profiles_by_origin=profiles,
    )


def _compute_shape(commit: Commit, origin: str) -> dict:
    """Compute shape metrics for a single commit."""
    files = commit.files
    files_changed = len(files)
    total_lines = sum(fc.lines_added + fc.lines_removed for fc in files)
    lines_per_file = total_lines / files_changed if files_changed > 0 else 0

    # Directory metrics
    dirs = {dirname(fc.path) or "." for fc in files}
    directories_touched = len(dirs)
    directory_spread = directories_touched / files_changed if files_changed > 1 else 0.0

    return {
        "origin": origin,
        "files_changed": files_changed,
        "total_lines": total_lines,
        "lines_per_file": lines_per_file,
        "directory_spread": directory_spread,
    }


def _build_profile(origin: str, shapes: list[dict]) -> ShapeProfile:
    """Build a ShapeProfile from a list of per-commit shape dicts."""
    files_list = [s["files_changed"] for s in shapes]
    lines_list = [s["total_lines"] for s in shapes]
    lpf_list = [s["lines_per_file"] for s in shapes]
    spread_list = [s["directory_spread"] for s in shapes]

    med_files = median(files_list)
    med_lines = median(lines_list)
    med_lpf = median(lpf_list)
    med_spread = median(spread_list)

    dominant = _classify_shape(med_files, med_lpf)

    return ShapeProfile(
        origin=origin,
        commit_count=len(shapes),
        median_files_changed=round(med_files, 1),
        median_total_lines=round(med_lines, 1),
        median_lines_per_file=round(med_lpf, 1),
        median_directory_spread=round(med_spread, 2),
        dominant_shape=dominant,
    )


def _classify_shape(median_files: float, median_lpf: float) -> str:
    """Classify dominant shape from median files and lines-per-file.

    Uses fixed thresholds:
    - files <= 3 = "few files", > 3 = "many files"
    - lpf <= 20 = "few lines/file", > 20 = "many lines/file"
    """
    many_files = median_files > 3
    many_lines = median_lpf > 20

    if many_files and many_lines:
        return "bulk"
    elif many_files and not many_lines:
        return "spread"
    elif not many_files and many_lines:
        return "focused"
    else:
        return "surgical"
