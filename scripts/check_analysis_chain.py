#!/usr/bin/env python3
"""Enforce the engine-platform analysis chain.

Every module under iris/analysis/ must satisfy one of:

  (a) imported by iris/metrics/aggregator.py
  (b) carries an `AGGREGATOR_OPT_OUT: <reason>` marker in the top 40 lines
      AND a `Consumers: <file[:symbol]>` line naming where it is invoked

Runs as a CI gate so new analysis modules cannot silently orphan.

Usage:
    python scripts/check_analysis_chain.py

Exit codes:
    0 — all modules accounted for
    1 — one or more modules orphaned
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_DIR = ROOT / "iris" / "analysis"
AGGREGATOR = ROOT / "iris" / "metrics" / "aggregator.py"

SKIP_FILES = {"__init__.py"}

OPT_OUT_RE = re.compile(r"#\s*AGGREGATOR_OPT_OUT:\s*(\S.*)")
CONSUMERS_RE = re.compile(r"#\s*Consumers:\s*(\S.*)")


def aggregator_imports() -> set[str]:
    text = AGGREGATOR.read_text()
    pattern = re.compile(r"from iris\.analysis\.(\w+)\s+import")
    return set(pattern.findall(text))


def opt_out_info(module_path: Path) -> tuple[str | None, str | None]:
    """Return (reason, consumers) if both markers present, else (None, None)."""
    reason: str | None = None
    consumers: str | None = None
    with module_path.open() as fh:
        for idx, line in enumerate(fh):
            if idx >= 40:
                break
            if reason is None:
                m = OPT_OUT_RE.search(line)
                if m:
                    reason = m.group(1).strip()
            if consumers is None:
                m = CONSUMERS_RE.search(line)
                if m:
                    consumers = m.group(1).strip()
    return reason, consumers


def main() -> int:
    if not ANALYSIS_DIR.is_dir():
        print(f"error: {ANALYSIS_DIR} not found", file=sys.stderr)
        return 1
    if not AGGREGATOR.is_file():
        print(f"error: {AGGREGATOR} not found", file=sys.stderr)
        return 1

    wired = aggregator_imports()
    errors: list[str] = []
    wired_count = 0
    opted_out_count = 0

    for path in sorted(ANALYSIS_DIR.glob("*.py")):
        if path.name in SKIP_FILES:
            continue
        module = path.stem

        if module in wired:
            wired_count += 1
            continue

        reason, consumers = opt_out_info(path)
        if reason and consumers:
            opted_out_count += 1
            continue

        if reason and not consumers:
            errors.append(
                f"  {module}: has AGGREGATOR_OPT_OUT but missing "
                f"'Consumers:' line naming where it is invoked"
            )
        elif not reason:
            errors.append(
                f"  {module}: not wired into aggregator and no "
                f"'AGGREGATOR_OPT_OUT: <reason>' marker in top 40 lines"
            )

    if errors:
        print("Analysis chain check failed:", file=sys.stderr)
        for err in errors:
            print(err, file=sys.stderr)
        print(
            "\nFix: wire the module into iris/metrics/aggregator.py, "
            "or add at the top of the module file:\n"
            "  # AGGREGATOR_OPT_OUT: <reason it runs outside the aggregator>\n"
            "  # Consumers: <path/to/caller.py[:function]>",
            file=sys.stderr,
        )
        return 1

    print(
        f"Analysis chain OK: {wired_count} wired, {opted_out_count} opted out."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
