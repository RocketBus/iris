"""Tests for iris/platform/identity.py — GitHub identity resolution.

Mocks `subprocess.run` (no network) to verify resolution order and the
bulk-commit-list improvement over the old per-email-only approach. See
issue: the same real person's non-noreply email wasn't resolving to their
GitHub login via the `?author=<email>` filter, even though GitHub's own
commit-list `.author.login` field resolves it fine.

Runnable as: `python -m pytest tests/test_identity.py -v`
"""

import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.platform import identity
from iris.models.commit import Commit


def _commit(author: str, email: str) -> Commit:
    return Commit(
        hash="deadbeef",
        author=author,
        author_email=email,
        date=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )


def _fail_run(cmd, **kwargs):
    raise AssertionError(f"subprocess.run should not have been called with {cmd}")


def test_noreply_email_resolves_without_any_commit_api_call(monkeypatch):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        if cmd[:2] == ["gh", "api"] and cmd[2].startswith("users/"):
            return SimpleNamespace(returncode=0, stdout="Renato Guimaraes\n", stderr="")
        return SimpleNamespace(returncode=1, stdout="", stderr="")

    monkeypatch.setattr(identity.subprocess, "run", fake_run)

    commits = [_commit("renatoguimaraescb", "123+renatoguimaraescb@users.noreply.github.com")]
    result = identity.resolve_active_users(commits, nwo="RocketBus/iris", days=90)

    assert result == [{"name": "Renato Guimaraes", "github": "renatoguimaraescb"}]
    assert not any("commits" in " ".join(c) for c in calls)


def test_non_noreply_email_resolves_via_bulk_commit_list_scan(monkeypatch):
    def fake_run(cmd, **kwargs):
        joined = " ".join(cmd)
        if "commits?since=" in joined:
            assert "--paginate" in cmd
            return SimpleNamespace(
                returncode=0,
                stdout="renato.guimaraes@clickbus.com\trenatoguimaraescb\n",
                stderr="",
            )
        if "commits?author=" in joined:
            raise AssertionError(
                "should not fall back to the per-email filter once the bulk scan resolves it"
            )
        if cmd[2].startswith("users/"):
            return SimpleNamespace(returncode=0, stdout="Renato Guimarães\n", stderr="")
        return SimpleNamespace(returncode=1, stdout="", stderr="")

    monkeypatch.setattr(identity.subprocess, "run", fake_run)

    commits = [_commit("Renato Guimaraes", "renato.guimaraes@clickbus.com")]
    result = identity.resolve_active_users(commits, nwo="RocketBus/iris", days=90)

    assert result == [{"name": "Renato Guimarães", "github": "renatoguimaraescb"}]


def test_falls_back_to_per_email_api_when_bulk_scan_misses(monkeypatch):
    def fake_run(cmd, **kwargs):
        joined = " ".join(cmd)
        if "commits?since=" in joined:
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        if "commits?author=" in joined:
            return SimpleNamespace(returncode=0, stdout="somebody\n", stderr="")
        return SimpleNamespace(returncode=1, stdout="", stderr="")

    monkeypatch.setattr(identity.subprocess, "run", fake_run)

    commits = [_commit("Some Body", "somebody@corp.com")]
    result = identity.resolve_active_users(commits, nwo="RocketBus/iris", days=90)

    assert result == [{"name": "Some Body", "github": "somebody"}]


def test_no_github_remote_skips_api_resolution_entirely(monkeypatch):
    monkeypatch.setattr(identity.subprocess, "run", _fail_run)

    commits = [_commit("Mystery", "mystery@corp.com")]
    result = identity.resolve_active_users(commits, nwo=None, days=90)

    assert result == [{"name": "Mystery"}]


def test_merges_two_emails_of_the_same_person_preferring_the_name_with_spaces(monkeypatch):
    # The real reported case: a noreply-style commit (resolves for free) and
    # a real work-email commit (resolves via the bulk scan) both belong to
    # the same GitHub account. Once merged under that shared identity, the
    # "real name" (has a space) wins over the bare username string.
    def fake_run(cmd, **kwargs):
        joined = " ".join(cmd)
        if "commits?since=" in joined:
            return SimpleNamespace(
                returncode=0,
                stdout="renato.guimaraes@clickbus.com\trenatoguimaraescb\n",
                stderr="",
            )
        return SimpleNamespace(returncode=1, stdout="", stderr="")

    monkeypatch.setattr(identity.subprocess, "run", fake_run)

    commits = [
        _commit("renatoguimaraescb", "123+renatoguimaraescb@users.noreply.github.com"),
        _commit("Renato Guimaraes", "renato.guimaraes@clickbus.com"),
    ]
    result = identity.resolve_active_users(commits, nwo="RocketBus/iris", days=90)

    assert result == [{"name": "Renato Guimaraes", "github": "renatoguimaraescb"}]


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
