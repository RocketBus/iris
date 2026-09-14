"""Compares two `metrics.json` field by field.

Exists for two reasons, both from the centralized-collection design doc:

  1. It is the acceptance criterion for the PR-fetch optimization — the
     output has to be identical before and after, on the same commit and
     window.
  2. It is the pilot's parity measurement, comparing the `metrics.json` the
     worker produces against one from a local run on the same repositories.

The payload is flattened into dotted paths (`group.subgroup.key`, with
`[i]` for list items) and compared key by key. It interprets no value —
it compares and reports.

Runnable as: `python scripts/compare_metrics.py A.json B.json`
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


class _Missing:
    """Sentinel for 'this key does not exist on this side'.

    A value of its own, not `None`, because `None` is a legitimate value in
    the payload — conflating the two would hide a real divergence.
    """

    __slots__ = ()

    def __repr__(self) -> str:
        return "<missing>"


MISSING = _Missing()


# Paths the comparison ignores, with the reason next to each one.
#
# Starts empty, and by measurement: the engine was run twice on the same
# commit and window across two repositories — 103 and 190 keys — without a
# single divergence. A new entry here only with proof of drift from a real
# run.
#
# Known candidates, not yet proven:
#   "durability_by_origin.*.median_age_days" and
#   "durability_by_tool.*.median_age_days" — age comes from
#       `(now - commit_date)`, but rounding to one decimal place absorbs
#       ~2.4h of drift.
#   "open_pr_aging.*" — ages measured against the `now` injected into the
#       aggregator; not exercised in the measurements above, which had no PRs.
IGNORED_PATHS: dict[str, str] = {}


@dataclass(frozen=True)
class Divergence:
    """A key that does not match between the two payloads."""

    path: str
    expected: Any
    found: Any


def flatten_metrics(payload: Any, prefix: str = "") -> dict[str, Any]:
    """Flattens a payload into `path -> leaf value`.

    A dict becomes `parent.key`; a list becomes `parent[i]`; a scalar is a
    leaf. An empty container becomes a leaf itself — without this, `{}` and
    "missing key" would be indistinguishable, and a section that vanished
    would go unnoticed.
    """
    if isinstance(payload, dict) and payload:
        flat: dict[str, Any] = {}
        for key, value in payload.items():
            child = f"{prefix}.{key}" if prefix else str(key)
            flat.update(flatten_metrics(value, child))
        return flat

    if isinstance(payload, list) and payload:
        flat = {}
        for index, value in enumerate(payload):
            flat.update(flatten_metrics(value, f"{prefix}[{index}]"))
        return flat

    if prefix == "" and isinstance(payload, (dict, list)):
        # An empty root is an empty payload — not a leaf named "". Without
        # this guard, comparing against `{}` would invent an empty-path
        # divergence in addition to the real one.
        return {}

    return {prefix: payload}


def path_is_ignored(path: str, ignored: dict[str, str]) -> bool:
    """Whether `path` matches any pattern in the ignore list.

    `*` covers **one** segment — `durability_by_origin.*.median_age_days`
    matches `...HUMAN.median_age_days` and not a deeper traversal. A
    wildcard that crossed dots would silence more than the entry says.
    """
    for pattern in ignored:
        regex = re.escape(pattern).replace(r"\*", r"[^.]*")
        if re.fullmatch(regex, path):
            return True
    return False


def compare_metrics(
    a: Any,
    b: Any,
    *,
    ignored: dict[str, str] | None = None,
) -> list[Divergence]:
    """Divergences between two payloads, sorted by path.

    An empty list means identical — which is the acceptance criterion.
    """
    ignore_list = IGNORED_PATHS if ignored is None else ignored
    flat_a = flatten_metrics(a)
    flat_b = flatten_metrics(b)

    divergences: list[Divergence] = []
    for path in sorted(set(flat_a) | set(flat_b)):
        if path_is_ignored(path, ignore_list):
            continue
        left = flat_a.get(path, MISSING)
        right = flat_b.get(path, MISSING)
        if left != right:
            divergences.append(Divergence(path=path, expected=left, found=right))
    return divergences
