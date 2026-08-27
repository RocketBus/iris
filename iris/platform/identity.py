"""Resolve commit authors to GitHub identities for the active_users push payload.

Extracted from what used to be nested closures inside `iris/cli.py`'s push
path so this logic is independently testable (mocked `subprocess.run`, no
network) and to give the bulk resolution step below a natural home.

Resolution order per email, cheapest/most-reliable first:
  1. GitHub noreply-email pattern (free, no API call)
  2. Bulk, date-bounded commit-list scan (few API calls total)
  3. Per-email filtered API fallback (existing behavior, rarely needed now)
"""

from __future__ import annotations

import re
import subprocess
from datetime import datetime, timedelta, timezone

from iris.models.commit import Commit

_NOREPLY_RE = re.compile(r"(?:\d+\+)?(.+)@users\.noreply\.github\.com$")


def _gh_username_from_noreply(email: str) -> str | None:
    """Extract a GitHub username from a noreply email — no API call needed."""
    m = _NOREPLY_RE.match(email)
    return m.group(1) if m else None


def _resolve_gh_name(username: str) -> str | None:
    """Resolve a GitHub username to a real display name via the API."""
    try:
        r = subprocess.run(
            ["gh", "api", f"users/{username}", "-q", ".name"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return None


def _resolve_authors_via_commit_list(nwo: str, days: int) -> dict[str, str]:
    """Resolve emails to GitHub logins in one paginated, date-bounded scan
    of the repo's commit list, reading the `.author.login` GitHub already
    attaches to each commit — instead of one `?author=<email>`-filtered
    request per email.

    The `?author=<email>` filter misses real matches: a commit email that's
    genuinely linked and verified on someone's GitHub account can still fail
    that filtered query, while it resolves cleanly via the plain commit-list
    endpoint's own `.author.login` field. Bounded to the same lookback
    window already used for the local `git log` read, so this can't turn
    into an unbounded scan on a long-lived repo.
    """
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    try:
        r = subprocess.run(
            [
                "gh", "api", f"repos/{nwo}/commits?since={since}&per_page=100",
                "--paginate",
                "-q", '.[] | select(.author.login != null) | '
                      '"\\(.commit.author.email)\\t\\(.author.login)"',
            ],
            capture_output=True, text=True, timeout=30,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {}
    if r.returncode != 0 or not r.stdout.strip():
        return {}

    result: dict[str, str] = {}
    for line in r.stdout.strip().splitlines():
        parts = line.split("\t", 1)
        if len(parts) == 2:
            email, login = parts
            result.setdefault(email.strip().lower(), login.strip())
    return result


def _resolve_emails_via_repo(nwo: str, emails: set[str]) -> dict[str, str]:
    """Per-email fallback for whatever the bulk scan didn't cover."""
    result: dict[str, str] = {}
    for email in emails:
        try:
            r = subprocess.run(
                ["gh", "api", f"repos/{nwo}/commits?author={email}&per_page=1",
                 "-q", ".[0].author.login"],
                capture_output=True, text=True, timeout=10,
            )
            if r.returncode == 0 and r.stdout.strip():
                result[email] = r.stdout.strip()
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
    return result


def resolve_active_users(
    commits: list[Commit], nwo: str | None, days: int
) -> list[dict[str, str]]:
    """Build the active_users list pushed with each analysis run.

    Args:
        commits: Commits from the analyzed window.
        nwo: "owner/repo" for the analyzed repo, or None if it has no
            detected GitHub remote (API resolution is skipped in that case;
            noreply-pattern extraction still applies).
        days: The analysis lookback window, in days — reused to bound the
            bulk commit-list scan to the same range already analyzed
            locally.

    Returns:
        [{"name": ..., "github": ...}, ...] — one entry per distinct
        identity, "github" omitted when unresolved.
    """
    # Step 1: collect emails, resolve what's free via the noreply pattern.
    email_to_names: dict[str, set[str]] = {}
    gh_usernames: set[str] = set()
    email_gh_cache: dict[str, str] = {}

    for c in commits:
        email = (c.author_email or "").lower()
        if email:
            email_to_names.setdefault(email, set()).add(c.author)
            gh = _gh_username_from_noreply(email)
            if gh:
                gh_usernames.add(gh)
                email_gh_cache[email] = gh

    # Step 2: bulk-resolve the rest via one date-bounded commit-list scan,
    # falling back to the per-email API only for stragglers.
    if nwo:
        unresolved = {e for e in email_to_names if e not in email_gh_cache}
        if unresolved:
            bulk_resolved = _resolve_authors_via_commit_list(nwo, days)
            for email in list(unresolved):
                login = bulk_resolved.get(email)
                if login:
                    email_gh_cache[email] = login
                    gh_usernames.add(login)
                    unresolved.discard(email)

        if unresolved:
            repo_resolved = _resolve_emails_via_repo(nwo, unresolved)
            for email, login in repo_resolved.items():
                email_gh_cache[email] = login
                gh_usernames.add(login)

    # Step 3: resolve GitHub usernames to real display names.
    gh_name_cache: dict[str, str] = {}
    for username in gh_usernames:
        real_name = _resolve_gh_name(username)
        if real_name:
            gh_name_cache[username.lower()] = real_name

    # Step 4: build the identity map — group by GitHub username, or the
    # email's local part when no username was resolved.
    identity_names: dict[str, str] = {}
    identity_github: dict[str, str | None] = {}
    for email, names in email_to_names.items():
        gh = email_gh_cache.get(email)
        key = (gh or email.split("@")[0]).lower()

        best = gh_name_cache.get(key) or max(names, key=len)
        if key in identity_names:
            old = identity_names[key]
            if " " in best and " " not in old:
                identity_names[key] = best
            elif len(best) > len(old):
                identity_names[key] = best
        else:
            identity_names[key] = best

        if gh and key not in identity_github:
            identity_github[key] = gh

    active_users: list[dict[str, str]] = []
    seen_names: set[str] = set()
    for key, name in sorted(identity_names.items(), key=lambda x: x[1]):
        if name in seen_names:
            continue
        seen_names.add(name)
        entry: dict[str, str] = {"name": name}
        gh_user = identity_github.get(key)
        if gh_user:
            entry["github"] = gh_user
        active_users.append(entry)

    return active_users
