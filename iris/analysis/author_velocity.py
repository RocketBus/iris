"""Author velocity — LOC per author per week.

Measures lines of code added/removed per author per week to detect:
- Unusually high output (possible AI-generated code)
- Contribution distribution across the team
- Individual velocity trends over time

Design decisions:
- Uses ISO weeks (Monday-Sunday) for consistent grouping
- Deduplicates authors by email (same logic as active_users)
- Reports both lines_added and lines_removed separately
- Flags authors with weekly LOC above a threshold as high_velocity
"""

# AGGREGATOR_OPT_OUT: produces per-author rows (risks individual framing).
# Kept outside aggregator so consumers can explicitly opt into the org-aggregate view only.
# Consumers: iris/cli.py (Step 5d), iris/reports/writer.py

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
import re

from iris.models.commit import Commit

# Weekly LOC above this is flagged as high velocity
HIGH_VELOCITY_THRESHOLD = 1000


@dataclass(frozen=True)
class AuthorWeek:
    """LOC stats for one author in one ISO week."""

    week_start: date
    commits: int
    lines_added: int
    lines_removed: int

    @property
    def lines_changed(self) -> int:
        return self.lines_added + self.lines_removed

    @property
    def loc_per_commit(self) -> float:
        return self.lines_changed / self.commits if self.commits else 0


@dataclass(frozen=True)
class AuthorVelocity:
    """Velocity summary for one author across the analysis window."""

    name: str
    email: str
    total_commits: int
    total_lines_added: int
    total_lines_removed: int
    weeks_active: int
    avg_loc_per_week: float
    max_loc_week: int
    high_velocity_weeks: int
    ai_commit_pct: float = 0.0  # % of this author's commits with AI co-author
    weekly: list[AuthorWeek] = field(default_factory=list)

    @property
    def total_lines_changed(self) -> int:
        return self.total_lines_added + self.total_lines_removed


@dataclass(frozen=True)
class AuthorVelocityResult:
    """Result of author velocity analysis."""

    authors: list[AuthorVelocity]
    total_authors: int
    high_velocity_authors: int

    def to_dict(self) -> dict:
        return {
            "total_authors": self.total_authors,
            "high_velocity_authors": self.high_velocity_authors,
            "authors": [
                {
                    "name": a.name,
                    "email": a.email,
                    "total_commits": a.total_commits,
                    "total_lines_added": a.total_lines_added,
                    "total_lines_removed": a.total_lines_removed,
                    "total_lines_changed": a.total_lines_changed,
                    "weeks_active": a.weeks_active,
                    "avg_loc_per_week": round(a.avg_loc_per_week, 1),
                    "max_loc_week": a.max_loc_week,
                    "high_velocity_weeks": a.high_velocity_weeks,
                    "ai_commit_pct": round(a.ai_commit_pct, 1),
                    "weekly": [
                        {
                            "week_start": str(w.week_start),
                            "commits": w.commits,
                            "lines_added": w.lines_added,
                            "lines_removed": w.lines_removed,
                        }
                        for w in a.weekly
                    ],
                }
                for a in self.authors
            ],
        }


def _normalize_author(email: str) -> str:
    """Extract a stable identity key from an email."""
    m = re.match(r"(?:\d+\+)?(.+)@users\.noreply\.github\.com$", email)
    if m:
        return m.group(1).lower()
    return email.lower()


def compute_author_velocity(
    commits: list[Commit],
    threshold: int = HIGH_VELOCITY_THRESHOLD,
    origin_map: dict[str, str] | None = None,
) -> AuthorVelocityResult | None:
    """Compute LOC per author per week.

    Args:
        commits: List of Commit objects.
        threshold: Weekly LOC above this is flagged as high velocity.
        origin_map: Optional {commit_hash: origin_value} for AI% calculation.

    Returns None if there are no commits with file stats.
    """
    if not commits:
        return None

    # Group commits by author (deduplicated by email) and ISO week
    # author_key -> { week_start -> { commits, added, removed } }
    author_weeks: dict[str, dict[date, dict]] = defaultdict(lambda: defaultdict(lambda: {"commits": 0, "added": 0, "removed": 0}))
    author_names: dict[str, str] = {}  # key -> best name
    author_emails: dict[str, str] = {}  # key -> email
    author_ai_commits: dict[str, int] = defaultdict(int)
    author_total_commits: dict[str, int] = defaultdict(int)

    for c in commits:
        key = _normalize_author(c.author_email) if c.author_email else c.author.lower()
        week_start = (c.date.date() - __import__("datetime").timedelta(days=c.date.weekday()))

        # Keep longest name per key
        if key not in author_names or len(c.author) > len(author_names[key]):
            author_names[key] = c.author
        author_emails[key] = c.author_email or c.author

        added = sum(f.lines_added for f in c.files)
        removed = sum(f.lines_removed for f in c.files)

        author_weeks[key][week_start]["commits"] += 1
        author_weeks[key][week_start]["added"] += added
        author_weeks[key][week_start]["removed"] += removed

        author_total_commits[key] += 1
        if origin_map and origin_map.get(c.hash) == "AI_ASSISTED":
            author_ai_commits[key] += 1

    # Build results
    authors: list[AuthorVelocity] = []

    for key, weeks in author_weeks.items():
        weekly = []
        total_commits = 0
        total_added = 0
        total_removed = 0
        max_loc = 0
        high_weeks = 0

        for ws in sorted(weeks.keys()):
            data = weeks[ws]
            w = AuthorWeek(
                week_start=ws,
                commits=data["commits"],
                lines_added=data["added"],
                lines_removed=data["removed"],
            )
            weekly.append(w)
            total_commits += w.commits
            total_added += w.lines_added
            total_removed += w.lines_removed
            if w.lines_changed > max_loc:
                max_loc = w.lines_changed
            if w.lines_changed >= threshold:
                high_weeks += 1

        weeks_active = len(weekly)
        avg_loc = (total_added + total_removed) / weeks_active if weeks_active else 0

        total_for_key = author_total_commits.get(key, 0)
        ai_for_key = author_ai_commits.get(key, 0)
        ai_pct = (ai_for_key / total_for_key * 100) if total_for_key > 0 else 0.0

        authors.append(AuthorVelocity(
            name=author_names[key],
            email=author_emails.get(key, key),
            total_commits=total_commits,
            total_lines_added=total_added,
            total_lines_removed=total_removed,
            weeks_active=weeks_active,
            avg_loc_per_week=avg_loc,
            max_loc_week=max_loc,
            high_velocity_weeks=high_weeks,
            ai_commit_pct=ai_pct,
            weekly=weekly,
        ))

    # Sort by total lines changed descending
    authors.sort(key=lambda a: a.total_lines_changed, reverse=True)

    high_velocity_count = sum(1 for a in authors if a.high_velocity_weeks > 0)

    return AuthorVelocityResult(
        authors=authors,
        total_authors=len(authors),
        high_velocity_authors=high_velocity_count,
    )
