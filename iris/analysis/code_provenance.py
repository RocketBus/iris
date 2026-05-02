"""Code provenance — measure the age of code being revised, by origin.

Uses git blame on the parent commit to determine when the lines being
modified were originally written. This reveals whether developers are
spending time improving mature code or constantly reworking recent code.

GitClear's 2025 research found that 79.2% of revised code in 2024 was
less than 1 month old (up from 70% in 2020), suggesting AI tools
accelerate churn on recently-written code rather than improving
established codebases.

Key metrics:
- Age distribution: % of revised lines in each age bracket
- Median age: how old is the code being changed
- pct_revising_new_code: % of revisions on code < 1 month old
- pct_revising_mature_code: % of revisions on code > 1 year old
- All segmented by origin (HUMAN, AI_ASSISTED)
"""

# AGGREGATOR_OPT_OUT: requires git blame I/O against the repo path.
# Aggregator operates on commit lists only; kept outside to preserve that boundary.
# Consumers: iris/cli.py (Step 4e)

import re
import subprocess
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import median

from iris.analysis.origin_classifier import CommitOrigin
from iris.models.commit import Commit


@dataclass(frozen=True)
class AgeDistribution:
    """Distribution of code age being revised."""

    pct_under_2_weeks: float
    pct_2_to_4_weeks: float
    pct_1_to_12_months: float
    pct_1_to_2_years: float
    pct_over_2_years: float
    median_age_days: float
    lines_sampled: int


@dataclass(frozen=True)
class ProvenanceByOrigin:
    """Code provenance for a single origin."""

    origin: str
    distribution: AgeDistribution
    commits_analyzed: int


@dataclass(frozen=True)
class ProvenanceResult:
    """Complete code provenance analysis."""

    overall: AgeDistribution
    by_origin: list[ProvenanceByOrigin]
    commits_sampled: int
    files_blamed: int


# Performance bounds.
MAX_COMMITS_TO_SAMPLE = 100
MAX_FILES_PER_COMMIT = 10
BLAME_TIMEOUT_SECONDS = 15

# Minimum lines to produce per-origin stats.
MIN_LINES_PER_ORIGIN = 20

# Age bracket boundaries.
_TWO_WEEKS = timedelta(days=14)
_FOUR_WEEKS = timedelta(days=28)
_ONE_YEAR = timedelta(days=365)
_TWO_YEARS = timedelta(days=730)

# Porcelain blame parser: extract commit hash and author-time.
_HASH_LINE_RE = re.compile(r"^([0-9a-f]{40})\s+\d+\s+\d+")
_AUTHOR_TIME_RE = re.compile(r"^author-time\s+(\d+)")


def calculate_provenance(
    repo_path: str,
    commits: list[Commit],
    origin_classified: list[tuple[Commit, CommitOrigin]],
) -> ProvenanceResult | None:
    """Calculate the age of code being revised, segmented by origin.

    For a sample of recent non-merge commits, runs git blame on the
    parent commit to determine when the lines being changed were
    originally introduced.

    Args:
        repo_path: Absolute path to the Git repository.
        commits: Commits sorted by date (analysis window).
        origin_classified: Pre-classified (commit, origin) pairs.

    Returns:
        ProvenanceResult with age distributions, or None if insufficient data.
    """
    if len(commits) < 5:
        return None

    origin_map = {c.hash: origin.value for c, origin in origin_classified}

    # Select recent non-merge commits with file modifications (both add+remove)
    candidates = []
    for commit in commits:
        if commit.is_merge:
            continue
        # Prioritize commits that modify (not just add) files
        has_modification = any(
            fc.lines_added > 0 and fc.lines_removed > 0
            for fc in commit.files
        )
        if has_modification:
            candidates.append(commit)

    candidates.sort(key=lambda c: c.date, reverse=True)
    candidates = candidates[:MAX_COMMITS_TO_SAMPLE]

    if not candidates:
        return None

    # Collect age data per origin
    all_ages: list[float] = []
    origin_ages: dict[str, list[float]] = defaultdict(list)
    origin_commits: dict[str, int] = defaultdict(int)
    files_blamed = 0

    for commit in candidates:
        origin = origin_map.get(commit.hash, CommitOrigin.HUMAN.value)
        origin_commits[origin] += 1

        # Select files with both additions and removals (modifications)
        mod_files = [
            fc for fc in commit.files
            if fc.lines_added > 0 and fc.lines_removed > 0
        ]
        mod_files.sort(key=lambda fc: fc.lines_removed, reverse=True)
        mod_files = mod_files[:MAX_FILES_PER_COMMIT]

        for fc in mod_files:
            ages = _blame_file_ages(repo_path, commit, fc.path)
            if ages is None:
                continue

            files_blamed += 1
            all_ages.extend(ages)
            origin_ages[origin].extend(ages)

    if not all_ages:
        return None

    # Build overall distribution
    overall = _build_distribution(all_ages)

    # Build per-origin distributions
    by_origin: list[ProvenanceByOrigin] = []
    for origin in [CommitOrigin.HUMAN.value, CommitOrigin.AI_ASSISTED.value]:
        ages = origin_ages.get(origin, [])
        if len(ages) < MIN_LINES_PER_ORIGIN:
            continue
        by_origin.append(ProvenanceByOrigin(
            origin=origin,
            distribution=_build_distribution(ages),
            commits_analyzed=origin_commits.get(origin, 0),
        ))

    return ProvenanceResult(
        overall=overall,
        by_origin=by_origin,
        commits_sampled=len(candidates),
        files_blamed=files_blamed,
    )


def _blame_file_ages(
    repo_path: str,
    commit: Commit,
    file_path: str,
) -> list[float] | None:
    """Run git blame on the parent of a commit and extract line ages.

    Returns a list of age-in-days for each blamed line, relative to
    the commit date. Returns None if blame fails.
    """
    try:
        result = subprocess.run(
            [
                "git", "-C", repo_path, "blame", "--porcelain",
                f"{commit.hash}^", "--", file_path,
            ],
            capture_output=True,
            text=True,
            timeout=BLAME_TIMEOUT_SECONDS,
        )
        if result.returncode != 0:
            return None

        line_epochs = _parse_porcelain_with_dates(result.stdout)
        if not line_epochs:
            return None

        # Compute age of each line relative to the modifying commit
        commit_ts = commit.date.timestamp()
        ages: list[float] = []
        for epoch in line_epochs:
            age_seconds = commit_ts - epoch
            if age_seconds < 0:
                continue  # clock skew, skip
            ages.append(age_seconds / 86400)

        return ages if ages else None

    except (subprocess.TimeoutExpired, Exception):
        return None


def _parse_porcelain_with_dates(output: str) -> list[int]:
    """Parse git blame --porcelain output extracting author-time epochs.

    Returns a list of epoch timestamps, one per content line in the file.
    """
    epochs: list[int] = []
    current_epoch: int | None = None

    for line in output.split("\n"):
        # New blame block header: 40-char hash
        m = _HASH_LINE_RE.match(line)
        if m:
            current_epoch = None  # reset for this block
            continue

        # author-time line within a block
        m = _AUTHOR_TIME_RE.match(line)
        if m:
            current_epoch = int(m.group(1))
            continue

        # Content line (starts with \t in porcelain format)
        if line.startswith("\t") and current_epoch is not None:
            epochs.append(current_epoch)

    return epochs


def _build_distribution(ages: list[float]) -> AgeDistribution:
    """Build an age distribution from a list of ages in days."""
    total = len(ages)
    if total == 0:
        return AgeDistribution(
            pct_under_2_weeks=0, pct_2_to_4_weeks=0,
            pct_1_to_12_months=0, pct_1_to_2_years=0,
            pct_over_2_years=0, median_age_days=0, lines_sampled=0,
        )

    under_2w = sum(1 for a in ages if a < 14)
    w2_to_4w = sum(1 for a in ages if 14 <= a < 28)
    m1_to_12m = sum(1 for a in ages if 28 <= a < 365)
    y1_to_2y = sum(1 for a in ages if 365 <= a < 730)
    over_2y = sum(1 for a in ages if a >= 730)

    return AgeDistribution(
        pct_under_2_weeks=round(under_2w / total, 3),
        pct_2_to_4_weeks=round(w2_to_4w / total, 3),
        pct_1_to_12_months=round(m1_to_12m / total, 3),
        pct_1_to_2_years=round(y1_to_2y / total, 3),
        pct_over_2_years=round(over_2y / total, 3),
        median_age_days=round(median(ages), 1),
        lines_sampled=total,
    )
