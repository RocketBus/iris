"""Compares two `metrics.json` field by field.

Exists for two reasons from the centralized-collection design doc: it is
the PR-fetch optimization's acceptance criterion (identical output before
and after, same commit and window), and the pilot's parity measurement
(the worker's `metrics.json` against a local run on the same repositories).

The payload is flattened into dotted paths (`group.subgroup.key`, with
`[i]` for list items) and compared key by key. It interprets no value —
it compares and reports.
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
# Starts empty — a new entry requires proof of drift from a real run.
# Known candidates, not yet proven:
#   "durability_by_origin.*.median_age_days" and
#   "durability_by_tool.*.median_age_days" — age is derived from the clock.
#   "open_pr_aging.*" — ages measured against an injected `now`.
IGNORED_PATHS: dict[str, str] = {}


@dataclass(frozen=True)
class Divergence:
    """A key that does not match between the two payloads."""

    path: str
    expected: Any
    found: Any


def flatten_metrics(payload: Any, prefix: str = "") -> dict[str, Any]:
    """Flattens a payload into `path -> leaf value`.

    A dict becomes `parent.key`, a list `parent[i]`, a scalar a leaf. An
    empty container is itself a leaf — otherwise `{}` and a missing key
    would be indistinguishable, hiding a vanished section.

    Assumes keys contain no `.` or `[`: a key that did would collide with a
    nested path (`{"a": {"b": 1}}` and `{"a.b": 1}` both flatten to `a.b`).
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
        # Empty root is a payload, not a leaf — else {} invents a divergence.
        return {}

    return {prefix: payload}


def path_is_ignored(path: str, ignored: dict[str, str]) -> bool:
    """Whether `path` matches any pattern in the ignore list.

    `*` covers **one** segment, not a whole traversal — a wildcard that
    crossed dots would silence more than the entry says.
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
        # Type-strict: `True == 1` and `1 == 1.0` in Python, but a JSON type
        # flip (bool vs int, int vs float) is a real change worth catching.
        if type(left) is not type(right) or left != right:
            divergences.append(Divergence(path=path, expected=left, found=right))
    return divergences


def format_divergences(divergences: list[Divergence]) -> str:
    """One line per divergence: the path, what was expected, and what was found.

    Empty when there is nothing to report, so callers can print it unconditionally.
    """
    if not divergences:
        return ""
    return "\n".join(
        f"  {d.path}\n      expected: {d.expected!r}\n      found: {d.found!r}"
        for d in divergences
    )
