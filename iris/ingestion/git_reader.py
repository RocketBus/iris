"""Git repository ingestion — reads commit history via subprocess.

Uses `git log` with a structured format to extract commit metadata
and per-file change stats. No external dependencies required.

Assumptions:
- `git` is available on PATH
- repo_path points to a valid Git repository
- Binary files are reported by git as "-\t-\tfilename" in --numstat and are excluded
"""

import re
import subprocess
from datetime import datetime, timedelta, timezone

from iris.models.commit import Commit, FileChange

# Delimiter unlikely to appear in commit messages
_FIELD_SEP = "<<<SEP>>>"
_COMMIT_SEP = "<<<COMMIT>>>"

# git log format: hash, author, email, date (ISO), parents (merge detection), subject, body
_LOG_FORMAT = _FIELD_SEP.join(["%H", "%an", "%ae", "%aI", "%P", "%s", "%b"]) + _COMMIT_SEP

# Co-author extraction from commit body
_CO_AUTHOR_RE = re.compile(r"Co-[Aa]uthored-[Bb]y: .+ <(.+)>", re.MULTILINE)


def read_commits(
    repo_path: str,
    days: int,
    include_merges: bool = False,
) -> list[Commit]:
    """Read commits from a local Git repo within a lookback window.

    Args:
        repo_path: Absolute path to a Git repository.
        days: Number of days to look back from now.
        include_merges: If False (default), merge commits are excluded.

    Returns:
        List of Commit objects sorted by date ascending.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    since_str = since.strftime("%Y-%m-%d")

    # Step 1: get commit metadata
    log_result = subprocess.run(
        [
            "git", "-C", repo_path, "log",
            f"--since={since_str}",
            f"--format={_LOG_FORMAT}",
            "--numstat",
        ],
        capture_output=True,
        text=True,
        check=True,
    )

    return _parse_log_output(log_result.stdout, include_merges)


def read_pr_commits(
    repo_path: str,
    commit_hashes: list[str],
) -> list[Commit]:
    """Read specific commits by hash from a local Git repo.

    Uses --no-walk to show exactly the listed commits without
    traversing the graph. Useful for reading only the commits
    that belong to a pull request.

    Args:
        repo_path: Absolute path to a Git repository.
        commit_hashes: List of full or abbreviated commit hashes.

    Returns:
        List of Commit objects sorted by date ascending.
        Commits not found in local history are silently skipped.
    """
    if not commit_hashes:
        return []

    try:
        log_result = subprocess.run(
            [
                "git", "-C", repo_path, "log",
                "--no-walk",
                f"--format={_LOG_FORMAT}",
                "--numstat",
                *commit_hashes,
            ],
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError:
        return []

    return _parse_log_output(log_result.stdout, include_merges=True)


def _parse_log_output(raw: str, include_merges: bool) -> list[Commit]:
    """Parse the combined git log + numstat output into Commit objects."""
    commits = []

    # Split on commit separator; last chunk is usually empty
    chunks = raw.split(_COMMIT_SEP)

    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue

        # After splitting on <<<COMMIT>>>, each chunk may contain:
        #   [numstat lines from PREVIOUS commit]\n[metadata<<<SEP>>>...for THIS commit]
        # The numstat from the previous commit appears before the first <<<SEP>>>.

        if _FIELD_SEP not in chunk:
            # Pure numstat chunk (belongs to the previous commit)
            # Attach to the last parsed commit below.
            if commits:
                prev = commits[-1]
                extra_files = _parse_numstat(chunk.split("\n"))
                commits[-1] = Commit(
                    hash=prev.hash,
                    author=prev.author,
                    author_email=prev.author_email,
                    date=prev.date,
                    message=prev.message,
                    files=prev.files + extra_files,
                    is_merge=prev.is_merge,
                    co_authors=prev.co_authors,
                )
            continue

        # Split chunk into: [numstat for prev commit] + [metadata for this commit]
        # The metadata starts at the first occurrence of <<<SEP>>>.
        # Everything before the hash (which precedes the first <<<SEP>>>) is numstat.
        first_sep_pos = chunk.index(_FIELD_SEP)
        # Walk back from first_sep_pos to find start of hash (hex chars after last newline)
        pre_meta = chunk[:first_sep_pos]
        last_nl = pre_meta.rfind("\n")
        if last_nl >= 0:
            # numstat lines for previous commit + hash starts after last newline
            prev_numstat_raw = pre_meta[:last_nl]
            meta_start = last_nl + 1
        else:
            prev_numstat_raw = ""
            meta_start = 0

        # Attach numstat to previous commit
        if prev_numstat_raw.strip() and commits:
            prev = commits[-1]
            extra_files = _parse_numstat(prev_numstat_raw.split("\n"))
            commits[-1] = Commit(
                hash=prev.hash,
                author=prev.author,
                author_email=prev.author_email,
                date=prev.date,
                message=prev.message,
                files=prev.files + extra_files,
                is_merge=prev.is_merge,
                co_authors=prev.co_authors,
            )

        # Parse this commit's metadata
        meta_and_body = chunk[meta_start:]
        parts = meta_and_body.split(_FIELD_SEP)
        if len(parts) < 6:
            continue

        commit_hash, author, author_email, date_str, parents, message = (
            parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
        )
        body = parts[6] if len(parts) > 6 else ""
        numstat_lines = []

        # Merge detection: merge commits have 2+ parents
        parent_count = len(parents.split()) if parents.strip() else 0
        is_merge = parent_count > 1

        if is_merge and not include_merges:
            continue

        date = datetime.fromisoformat(date_str)

        # Extract co-author emails from body
        co_authors = _CO_AUTHOR_RE.findall(body)

        files = _parse_numstat(numstat_lines)

        commits.append(Commit(
            hash=commit_hash.strip(),
            author=author.strip(),
            author_email=author_email.strip(),
            date=date,
            message=message.strip(),
            files=files,
            is_merge=is_merge,
            co_authors=co_authors,
        ))

    # Sort by date ascending (oldest first)
    commits.sort(key=lambda c: c.date)
    return commits


def _parse_numstat(lines: list[str]) -> list[FileChange]:
    """Parse git numstat lines into FileChange objects.

    Numstat format: <added>\t<removed>\t<filepath>
    Binary files show as: -\t-\t<filepath>
    """
    changes = []
    for line in lines:
        parts = line.split("\t", 2)
        if len(parts) < 3:
            continue

        added_str, removed_str, path = parts

        # Skip binary files (git reports them as "-")
        if added_str == "-" or removed_str == "-":
            continue

        try:
            added = int(added_str)
            removed = int(removed_str)
        except ValueError:
            continue

        changes.append(FileChange(path=path.strip(), lines_added=added, lines_removed=removed))

    return changes
