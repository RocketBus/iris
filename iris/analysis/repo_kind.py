"""Repository kind — does this repo ship software, or only prose?

Some repositories exist to hold issues, cards, specs, or documentation. Their
commit history is real and their metrics compute cleanly, but what those
metrics describe is the stabilization, churn and durability of *markdown*.
Read on a delivery dashboard, or averaged into an org median, they pass for
delivery signal.

Detection is deterministic: a repo is CODE when its tracked files include a
recognized project manifest — the file a build, package manager, or deploy
step needs to exist. No manifest means nothing is built or deployed from this
tree.

Share-of-changed-lines was tried first and rejected: over a 39-repo corpus it
put documentation repos at 0–41% and a live Java service at 54%, too narrow a
margin to gate anything on. Manifest presence separated the same corpus with
no false negatives.

This never suppresses analysis — the repo is still measured and still
reported. It marks the result as not comparable to a delivery repo, the same
way `merge_strategy_detector` marks squash repos' per-commit metrics.
"""

# AGGREGATOR_OPT_OUT: repository-level property of the file tree; needs repo_path, not commits.
# Consumers: iris/cli.py (_merge_repo_kind), iris/org_runner.py:analyze_single_repo

import os
import subprocess
from enum import Enum


class RepoKind(Enum):
    """Whether a repository ships software."""

    CODE = "CODE"
    NON_CODE = "NON_CODE"


# Files whose presence means something here is built, packaged, or deployed.
# Grouped by ecosystem. Expected to grow — a stack whose manifest is missing
# from this list is classified NON_CODE, so additions are the fix.
_MANIFEST_FILES: frozenset[str] = frozenset({
    # JavaScript / TypeScript
    "package.json",
    "tsconfig.json",
    "deno.json",
    "deno.jsonc",
    # Python
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
    "requirements.txt",
    "Pipfile",
    "environment.yml",
    # JVM
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
    "settings.gradle.kts",
    "build.sbt",
    "build.xml",
    # Go / Rust / C / C++
    "go.mod",
    "Cargo.toml",
    "CMakeLists.txt",
    "meson.build",
    "configure.ac",
    # Ruby / PHP / Elixir / Erlang / Dart / Swift
    "Gemfile",
    "composer.json",
    "mix.exs",
    "rebar.config",
    "pubspec.yaml",
    "Package.swift",
    # Clojure / Julia / R / Haskell / Perl
    "deps.edn",
    "project.clj",
    "Project.toml",
    "DESCRIPTION",
    "stack.yaml",
    "Makefile.PL",
    # Zig / Nim / Lua
    "build.zig",
    # Build & deploy
    "Makefile",
    "makefile",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Chart.yaml",
    "serverless.yml",
    "template.yaml",
    "Vagrantfile",
})

# Manifests identified by extension rather than exact name.
_MANIFEST_SUFFIXES: tuple[str, ...] = (
    ".csproj",
    ".fsproj",
    ".vbproj",
    ".sln",
    ".gemspec",
    ".podspec",
    ".cabal",
    ".nimble",
    ".rockspec",
    ".tf",
)


def classify_repo_kind(repo_path: str) -> RepoKind:
    """Classify a repository as CODE or NON_CODE.

    Args:
        repo_path: Absolute path to a Git repository.

    Returns:
        RepoKind.CODE when a project manifest is tracked, or when the tree
        cannot be listed — an unreadable tree is never grounds for
        downgrading a repo.
    """
    tracked = _tracked_files(repo_path)
    if not tracked:
        return RepoKind.CODE

    for path in tracked:
        name = os.path.basename(path)
        if name in _MANIFEST_FILES or name.endswith(_MANIFEST_SUFFIXES):
            return RepoKind.CODE

    return RepoKind.NON_CODE


def _tracked_files(repo_path: str) -> list[str]:
    """List files tracked by Git.

    Empty list when the tree can't be read: `git ls-files` failing, timing
    out, or its output failing to decode. Paths come back with
    `surrogateescape`, so a non-UTF-8 file name never aborts the run.
    """
    try:
        result = subprocess.run(
            ["git", "-C", repo_path, "ls-files", "-z"],
            capture_output=True,
            text=True,
            errors="surrogateescape",
            check=True,
            timeout=60,
        )
    except (subprocess.SubprocessError, OSError):
        return []

    return [path for path in result.stdout.split("\0") if path]
