"""Correction cascade detector — find fix-following patterns in commit history.

Detects when a commit is followed by one or more FIX commits touching the same
files within a configurable window. This measures "correction cascades" — a proxy
for code that needed immediate repair after delivery.

Key design decisions:
- Origin attribution goes to the TRIGGER commit (who wrote the code that broke),
  not the fix commit (who repaired it)
- Merge commits and BOT commits are excluded as triggers
- CONFIG commits are excluded as triggers (config rarely "breaks" in the cascade sense)
- Fix followers can be any origin — what matters is causation, not who fixes
- Minimum 5 commits per origin to compute per-origin cascade rate
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import timedelta
from statistics import median

from iris.analysis.intent_classifier import classify_commit
from iris.analysis.origin_classifier import CommitOrigin, classify_origin
from iris.models.commit import Commit
from iris.models.intent import ChangeIntent


@dataclass(frozen=True)
class FixFollower:
    """A FIX commit that follows a trigger commit on shared files."""

    commit_hash: str
    origin: str
    date: "datetime"
    latency_hours: float
    shared_files: list[str]


@dataclass(frozen=True)
class CorrectionCascade:
    """A detected correction cascade: trigger commit + its fix followers."""

    trigger_hash: str
    trigger_origin: str
    trigger_intent: str
    trigger_date: "datetime"
    trigger_files: list[str]
    fix_followers: list[FixFollower]
    cascade_depth: int
    cascade_duration_hours: float
    files_requiring_fix: list[str]


@dataclass(frozen=True)
class CascadeByOrigin:
    """Cascade metrics for a single origin."""

    origin: str
    total_commits: int
    cascades: int
    cascade_rate: float
    median_depth: float


@dataclass(frozen=True)
class CascadeByTool:
    """Cascade metrics for a specific AI tool."""

    tool: str
    total_commits: int
    cascades: int
    cascade_rate: float
    median_depth: float


@dataclass(frozen=True)
class CascadeResult:
    """Complete cascade analysis result."""

    total_trigger_commits: int
    cascades_detected: int
    cascade_rate: float
    median_cascade_depth: float
    median_cascade_duration_hours: float
    by_origin: list[CascadeByOrigin]
    by_tool: list[CascadeByTool] = field(default_factory=list)
    cascades: list[CorrectionCascade] = field(default_factory=list)


# Default cascade window in days.
DEFAULT_CASCADE_WINDOW_DAYS = 7

# Minimum commits per origin to compute per-origin cascade rate.
MIN_COMMITS_PER_ORIGIN = 5

# Intents excluded as triggers (CONFIG rarely "breaks" in a cascade sense).
_EXCLUDED_TRIGGER_INTENTS = frozenset({ChangeIntent.CONFIG})


def detect_cascades(
    commits: list[Commit],
    origin_classified: list[tuple[Commit, CommitOrigin]],
    cascade_window_days: int = DEFAULT_CASCADE_WINDOW_DAYS,
    tool_map: dict[str, str] | None = None,
) -> CascadeResult | None:
    """Detect correction cascades in commit history.

    Args:
        commits: All commits sorted by date ascending.
        origin_classified: Pre-classified (commit, origin) pairs from origin_classifier.
        cascade_window_days: Window in days to look for fix followers.
        tool_map: Optional commit hash -> tool name mapping from build_tool_map().

    Returns:
        CascadeResult with cascade metrics, or None if insufficient data.
    """
    if len(commits) < 2:
        return None

    # Build lookup maps
    origin_map = {c.hash: origin for c, origin in origin_classified}
    intent_map = {}
    for commit in commits:
        classified = classify_commit(commit)
        intent_map[commit.hash] = classified.intent

    window = timedelta(days=cascade_window_days)

    # Identify valid triggers (non-merge, non-BOT, non-CONFIG)
    triggers: list[Commit] = []
    for commit in commits:
        if commit.is_merge:
            continue
        origin = origin_map.get(commit.hash, CommitOrigin.HUMAN)
        if origin == CommitOrigin.BOT:
            continue
        intent = intent_map.get(commit.hash, ChangeIntent.UNKNOWN)
        if intent in _EXCLUDED_TRIGGER_INTENTS:
            continue
        if not commit.files:
            continue
        triggers.append(commit)

    if not triggers:
        return None

    # Detect cascades
    cascades: list[CorrectionCascade] = []

    for trigger in triggers:
        trigger_files = {fc.path for fc in trigger.files}
        fix_followers: list[FixFollower] = []

        # Look at all commits after the trigger within the window
        for candidate in commits:
            if candidate.date <= trigger.date:
                continue
            if candidate.date > trigger.date + window:
                break
            if candidate.hash == trigger.hash:
                continue

            # Must be classified as FIX
            candidate_intent = intent_map.get(candidate.hash, ChangeIntent.UNKNOWN)
            if candidate_intent != ChangeIntent.FIX:
                continue

            # Must share at least one file
            candidate_files = {fc.path for fc in candidate.files}
            shared = trigger_files & candidate_files
            if not shared:
                continue

            latency = (candidate.date - trigger.date).total_seconds() / 3600
            candidate_origin = origin_map.get(candidate.hash, CommitOrigin.HUMAN)

            fix_followers.append(FixFollower(
                commit_hash=candidate.hash,
                origin=candidate_origin.value,
                date=candidate.date,
                latency_hours=round(latency, 1),
                shared_files=sorted(shared),
            ))

        if fix_followers:
            trigger_origin = origin_map.get(trigger.hash, CommitOrigin.HUMAN)
            trigger_intent = intent_map.get(trigger.hash, ChangeIntent.UNKNOWN)
            all_fixed_files = set()
            for ff in fix_followers:
                all_fixed_files.update(ff.shared_files)

            duration = max(ff.latency_hours for ff in fix_followers)

            cascades.append(CorrectionCascade(
                trigger_hash=trigger.hash,
                trigger_origin=trigger_origin.value,
                trigger_intent=trigger_intent.value,
                trigger_date=trigger.date,
                trigger_files=sorted(trigger_files),
                fix_followers=fix_followers,
                cascade_depth=len(fix_followers),
                cascade_duration_hours=round(duration, 1),
                files_requiring_fix=sorted(all_fixed_files),
            ))

    # Compute aggregate metrics
    total_triggers = len(triggers)
    total_cascades = len(cascades)
    cascade_rate = total_cascades / total_triggers if total_triggers > 0 else 0.0

    depths = [c.cascade_depth for c in cascades]
    durations = [c.cascade_duration_hours for c in cascades]
    median_depth = median(depths) if depths else 0.0
    median_duration = median(durations) if durations else 0.0

    # Per-origin breakdown
    origin_trigger_counts: dict[str, int] = defaultdict(int)
    origin_cascade_counts: dict[str, int] = defaultdict(int)
    origin_depths: dict[str, list[int]] = defaultdict(list)

    # Per-tool breakdown
    tool_trigger_counts: dict[str, int] = defaultdict(int)
    tool_cascade_counts: dict[str, int] = defaultdict(int)
    tool_depths: dict[str, list[int]] = defaultdict(list)

    for trigger in triggers:
        origin = origin_map.get(trigger.hash, CommitOrigin.HUMAN).value
        origin_trigger_counts[origin] += 1
        if tool_map:
            tool = tool_map.get(trigger.hash)
            if tool:
                tool_trigger_counts[tool] += 1

    for cascade in cascades:
        origin_cascade_counts[cascade.trigger_origin] += 1
        origin_depths[cascade.trigger_origin].append(cascade.cascade_depth)
        if tool_map:
            tool = tool_map.get(cascade.trigger_hash)
            if tool:
                tool_cascade_counts[tool] += 1
                tool_depths[tool].append(cascade.cascade_depth)

    by_origin: list[CascadeByOrigin] = []
    for origin in ["HUMAN", "AI_ASSISTED"]:
        total = origin_trigger_counts.get(origin, 0)
        if total < MIN_COMMITS_PER_ORIGIN:
            continue
        cas = origin_cascade_counts.get(origin, 0)
        rate = cas / total if total > 0 else 0.0
        med_depth = median(origin_depths[origin]) if origin_depths[origin] else 0.0
        by_origin.append(CascadeByOrigin(
            origin=origin,
            total_commits=total,
            cascades=cas,
            cascade_rate=round(rate, 3),
            median_depth=med_depth,
        ))

    by_tool: list[CascadeByTool] = []
    if tool_map:
        for tool in sorted(tool_trigger_counts.keys()):
            total = tool_trigger_counts[tool]
            if total < MIN_COMMITS_PER_ORIGIN:
                continue
            cas = tool_cascade_counts.get(tool, 0)
            rate = cas / total if total > 0 else 0.0
            med_depth = median(tool_depths[tool]) if tool_depths[tool] else 0.0
            by_tool.append(CascadeByTool(
                tool=tool,
                total_commits=total,
                cascades=cas,
                cascade_rate=round(rate, 3),
                median_depth=med_depth,
            ))

    return CascadeResult(
        total_trigger_commits=total_triggers,
        cascades_detected=total_cascades,
        cascade_rate=round(cascade_rate, 3),
        median_cascade_depth=median_depth,
        median_cascade_duration_hours=round(median_duration, 1),
        by_origin=by_origin,
        by_tool=by_tool,
        cascades=cascades,
    )
