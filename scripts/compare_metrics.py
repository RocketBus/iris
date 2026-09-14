#!/usr/bin/env python3
"""Compares two `metrics.json` files field by field.

Two uses, and both come from the centralized-collection design doc:

  - PR-fetch optimization gate: the engine's output has to be identical
    before and after, on the same commit and window;
  - pilot parity measurement: the worker's output against a local run on
    the same repositories.

Usage:
    python scripts/compare_metrics.py BEFORE.json AFTER.json

Exit codes:
    0 — identical (discounting the ignore list)
    1 — divergent; each key is printed with both sides
    2 — usage error: unreadable file (missing, a directory, unreadable
        permissions) or content that is not valid JSON text
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from iris.reports.metrics_diff import (  # noqa: E402
    IGNORED_PATHS,
    compare_metrics,
    format_divergences,
)


def _load(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        print(f"cannot read {path}: {exc}", file=sys.stderr)
        raise SystemExit(2)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        print(f"cannot parse {path} as JSON: {exc}", file=sys.stderr)
        raise SystemExit(2)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Compares two metrics.json files field by field.",
    )
    parser.add_argument("before", type=Path, help="reference metrics.json")
    parser.add_argument("after", type=Path, help="metrics.json to check")
    args = parser.parse_args()

    divergences = compare_metrics(_load(args.before), _load(args.after))

    if not divergences:
        ignored = f" ({len(IGNORED_PATHS)} paths ignored)" if IGNORED_PATHS else ""
        print(f"metrics.json identical field by field{ignored}.")
        return 0

    print(f"{len(divergences)} divergence(s):")
    print(format_divergences(divergences))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
