"""Process-level read cache for multi-window analysis (issue #80).

`iris analyze` analyzes several lookback windows (7/15/30/60/90) by re-running
the pipeline once per window. The widest window is a superset of the narrower
ones, so re-fetching pull requests for each is wasted work — and the `gh` PR
fetch dominates a run's wall-clock (~65% on a typical repo).

When enabled, this cache makes `read_pull_requests` fetch the widest window
once per repo and serve the narrower windows by re-applying the same
window-overlap filter to the cached objects in memory. It is opt-in (the CLI
turns it on only for multi-window runs and resets it afterwards) so
single-window runs, `iris pr`, and tests are unaffected.

Correctness does not depend on call order: a request wider than what is cached
triggers a fresh fetch that widens the cache. The CLI processes windows
widest-first so every later window is a slice, not a fetch.

Only PR fetches are cached. Commit reads use git's day-granularity `--since`
(slicing by datetime could drop a boundary commit) and diff reads are capped to
the most-recent N commits — both are cheap and left to re-read per window to
avoid those edge cases. The PR overlap filter, by contrast, compares full
datetimes, so an in-memory slice is exact.
"""

from datetime import datetime, timedelta, timezone
from typing import Callable

_enabled = False
# repo_path -> (width_days, prs) — `prs` were fetched for a `width_days` window.
_prs: dict[str, tuple[int, list]] = {}


def enable() -> None:
    """Turn the cache on for the current process."""
    global _enabled
    _enabled = True


def reset() -> None:
    """Turn the cache off and drop everything it holds."""
    global _enabled
    _enabled = False
    _prs.clear()


def pull_requests(
    repo_path: str,
    days: int,
    load: Callable[[], list],
    keep: Callable[[object, datetime], bool],
) -> list:
    """Return PRs for `days`, slicing a cached wider fetch when possible.

    Args:
        repo_path: Repo the PRs belong to (cache key).
        days: Lookback window requested.
        load: Fetches and parses PRs for `days` (the expensive `gh` call).
        keep: `keep(pr, since)` — True if `pr` belongs in a window starting at
            `since`. Re-applies the exact overlap filter to cached objects.
    """
    if not _enabled:
        return load()

    cached = _prs.get(repo_path)
    if cached is not None and days <= cached[0]:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        return [pr for pr in cached[1] if keep(pr, since)]

    fresh = load()
    _prs[repo_path] = (days, fresh)
    return fresh
