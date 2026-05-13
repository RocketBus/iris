#!/usr/bin/env python3
"""Probe Datadog DORA Metrics API v2 read endpoints.

Exploration script for issue #15. We need real responses to confirm the
hypotheses in docs/PLAN-datadog.md §8 before slice 3 (ingestion) ships:

  - response envelope shape on POST /api/v2/dora/deployments
  - response envelope shape on POST /api/v2/dora/failures
  - pagination cursor field name (next_token? cursor? meta.page.after?)
  - default `query` behavior (`*` vs `env:production`)
  - which fields actually appear on real events (repository_url, commit_sha, ...)

Stdlib only — no new dependency for a throwaway probe.

Usage:
    DD_API_KEY=... DD_APP_KEY=... DD_SITE=datadoghq.com \\
        python scripts/datadog_dora_probe.py --dump out/dora-probe

Exit codes:
    0 — both endpoints returned 2xx
    1 — at least one endpoint returned >= 400
    2 — missing credentials in env
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEFAULT_SITE = "datadoghq.com"
DEFAULT_DAYS = 7
DEFAULT_LIMIT = 50

# Datadog's UI labels sites as US1/US3/EU/etc. but only US3, US5, AP1 carry
# a region prefix in the host. US1 and EU are bare. Normalize the common
# mislabel so users can paste the UI value directly.
SITE_ALIASES = {
    "us1.datadoghq.com": "datadoghq.com",
    "eu1.datadoghq.eu": "datadoghq.eu",
    "eu.datadoghq.com": "datadoghq.eu",
}


def env_or_die(key: str) -> str:
    val = os.environ.get(key)
    if not val:
        print(f"error: {key} not set in environment", file=sys.stderr)
        sys.exit(2)
    return val


def call(
    site: str, path: str, body: dict, api_key: str, app_key: str
) -> tuple[int, dict | None, str]:
    url = f"https://api.{site}{path}"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "DD-API-KEY": api_key,
            "DD-APPLICATION-KEY": app_key,
            "User-Agent": "iris-dora-probe/0.1",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            status = resp.status
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        status = exc.code
    except urllib.error.URLError as exc:
        print(f"error: network failure calling {url}: {exc}", file=sys.stderr)
        return 0, None, ""

    try:
        return status, json.loads(raw), raw
    except json.JSONDecodeError:
        return status, None, raw


def build_body(from_iso: str, to_iso: str, query: str, req_type: str, limit: int) -> dict:
    # Datadog DORA v2 rejects numeric `from`/`to`; it wants ISO 8601 strings.
    return {
        "data": {
            "type": req_type,
            "attributes": {
                "from": from_iso,
                "to": to_iso,
                "query": query,
                "limit": limit,
            },
        }
    }


def paginate_test(
    site: str,
    api_key: str,
    app_key: str,
    name: str,
    path: str,
    req_type: str,
    from_iso: str,
    to_iso: str,
    query: str,
    page_size: int,
    dump_dir: Path | None,
) -> bool:
    """Fetch page 1 then try N pagination hypotheses. Print what advances.

    "Advances" means: returned a non-empty page whose first event id differs
    from page 1's first event id (the cheap detector for "the API ignored
    our cursor and replayed page 1"). For time-slicing we additionally
    check that the first event's `started_at` is older than page 1's last.
    """
    print(f"\n=== pagination probe: {name}  (limit={page_size}) ===")
    base_attrs = {"from": from_iso, "to": to_iso, "query": query, "limit": page_size}
    body1 = {"data": {"type": req_type, "attributes": base_attrs}}
    status, parsed, raw = call(site, path, body1, api_key, app_key)
    if status != 200 or not parsed:
        print(f"  page 1 failed: HTTP {status}")
        return False
    events1 = parsed.get("data") or []
    if len(events1) < page_size:
        print(
            f"  only {len(events1)} events in window — increase --days to "
            f"force overflow (need ≥ {page_size + 1})"
        )
        return False

    page1_first_id = events1[0].get("id")
    page1_last_event = events1[-1]
    page1_last_id = page1_last_event.get("id")
    page1_last_started = (page1_last_event.get("attributes") or {}).get("started_at")
    page1_ids = {e.get("id") for e in events1}

    print(
        f"  page 1: {len(events1)} events  first_id={page1_first_id}  "
        f"last_id={page1_last_id}  last_started_at={page1_last_started}"
    )
    if dump_dir is not None:
        (dump_dir / f"{name}_page1.json").write_text(raw)

    candidates: list[tuple[str, dict]] = [
        ("attributes.cursor",       {"cursor": page1_last_id}),
        ("attributes.next_token",   {"next_token": page1_last_id}),
        ("attributes.page.after",   {"page": {"after": page1_last_id}}),
        ("attributes.page.cursor",  {"page": {"cursor": page1_last_id}}),
        ("attributes.page.offset",  {"page": {"offset": page_size, "limit": page_size}}),
        ("time-slice (to=last_started_at)", {"to": page1_last_started}),
    ]

    print("  --- candidates ---")
    advanced: list[str] = []
    for label, extra in candidates:
        attrs = {**base_attrs, **extra}
        body = {"data": {"type": req_type, "attributes": attrs}}
        status, parsed, raw = call(site, path, body, api_key, app_key)
        if status == 0:
            print(f"  ✗ {label}: network error")
            continue
        if status >= 400:
            errors = (parsed or {}).get("errors") or [{}]
            detail = errors[0].get("detail", f"HTTP {status}")
            print(f"  ✗ {label}: HTTP {status}  {detail}")
            continue
        events = (parsed or {}).get("data") or []
        if not events:
            print(f"  ⚠ {label}: HTTP {status}, 0 events")
            continue
        new_first_id = events[0].get("id")
        new_first_started = (events[0].get("attributes") or {}).get("started_at")
        new_ids = {e.get("id") for e in events}
        overlap = len(new_ids & page1_ids)
        new_count = len(new_ids - page1_ids)
        replayed = new_ids == page1_ids
        did_advance = new_count > 0
        marker = "✓" if did_advance else ("=" if replayed else "?")
        print(
            f"  {marker} {label}: HTTP {status}, {len(events)} events, "
            f"first_id={new_first_id}, first_started_at={new_first_started}, "
            f"overlap={overlap}/{len(events)}  new={new_count}"
        )
        if did_advance:
            advanced.append(label)
            if dump_dir is not None:
                safe = (
                    label.replace(" ", "_").replace("=", "").replace("(", "")
                    .replace(")", "").replace(".", "_")
                )
                (dump_dir / f"{name}_{safe}.json").write_text(raw)

    if advanced:
        print(f"\n  ✓ candidates that advanced: {advanced}")
    else:
        print("\n  ✗ no candidate advanced — must fall back to time-slicing in slice 3")
    return bool(advanced)


def summarize(name: str, status: int, parsed: dict | None, raw: str) -> None:
    print(f"\n=== {name} → HTTP {status} ===")
    if parsed is None:
        print("(non-JSON body, first 500 chars)")
        print(raw[:500])
        return

    if status >= 400:
        errors = parsed.get("errors")
        if errors:
            print(f"errors: {json.dumps(errors, indent=2)}")
        else:
            print(json.dumps(parsed, indent=2)[:500])
        return

    data = parsed.get("data")
    if isinstance(data, list):
        print(f"events returned: {len(data)}")
        if data and isinstance(data[0], dict):
            first = data[0]
            attrs = first.get("attributes") or {}
            print(f"first event id: {first.get('id')}")
            print(f"first event attribute keys: {sorted(attrs.keys())}")
    else:
        print(f"unexpected `data` shape: {type(data).__name__}")

    meta = parsed.get("meta")
    if meta:
        print(f"meta keys: {sorted(meta.keys())}")
        for k in ("page", "pagination", "next_token", "cursor", "next_cursor", "after"):
            if k in meta:
                print(f"  pagination hint → meta.{k} = {meta[k]}")
    links = parsed.get("links")
    if links:
        print(f"links: {json.dumps(links, indent=2)}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--days", type=int, default=DEFAULT_DAYS,
        help=f"how many days back to query (default: {DEFAULT_DAYS})",
    )
    parser.add_argument(
        "--query", default="*",
        help="DORA filter query (default: '*' — all events)",
    )
    parser.add_argument(
        "--limit", type=int, default=DEFAULT_LIMIT,
        help=f"page size (default: {DEFAULT_LIMIT})",
    )
    parser.add_argument(
        "--endpoint", choices=["deployments", "failures", "both"], default="both",
    )
    parser.add_argument(
        "--dump", metavar="DIR",
        help="if set, save full raw JSON responses to this directory",
    )
    parser.add_argument(
        "--paginate-test", action="store_true",
        help="fetch page 1, then try several pagination hypotheses to see which one advances",
    )
    args = parser.parse_args()

    api_key = env_or_die("DD_API_KEY")
    app_key = env_or_die("DD_APP_KEY")
    raw_site = os.environ.get("DD_SITE", DEFAULT_SITE)
    site = SITE_ALIASES.get(raw_site, raw_site)
    if site != raw_site:
        print(f"note: DD_SITE={raw_site!r} normalized to {site!r}")

    now = datetime.now(timezone.utc).replace(microsecond=0)
    from_iso = (now - timedelta(days=args.days)).isoformat().replace("+00:00", "Z")
    to_iso = now.isoformat().replace("+00:00", "Z")

    print(f"site:   {site}")
    print(f"window: {from_iso} → {to_iso}")
    print(f"query:  {args.query!r}  limit: {args.limit}")

    targets: list[tuple[str, str, str]] = []
    if args.endpoint in ("deployments", "both"):
        targets.append(
            ("deployments", "/api/v2/dora/deployments", "dora_deployments_list_request")
        )
    if args.endpoint in ("failures", "both"):
        targets.append(
            ("failures", "/api/v2/dora/failures", "dora_failures_list_request")
        )

    dump_dir: Path | None = None
    if args.dump:
        dump_dir = Path(args.dump)
        dump_dir.mkdir(parents=True, exist_ok=True)

    overall_ok = True
    for name, path, req_type in targets:
        if args.paginate_test:
            ok = paginate_test(
                site, api_key, app_key, name, path, req_type,
                from_iso, to_iso, args.query, args.limit, dump_dir,
            )
            if not ok:
                overall_ok = False
            continue
        body = build_body(from_iso, to_iso, args.query, req_type, args.limit)
        status, parsed, raw = call(site, path, body, api_key, app_key)
        if status == 0:
            overall_ok = False
            continue  # network failure already reported by call()
        summarize(name, status, parsed, raw)
        if dump_dir is not None and raw:
            out = dump_dir / f"{name}.json"
            out.write_text(raw)
            print(f"  raw saved → {out}")
        if status >= 400:
            overall_ok = False

    return 0 if overall_ok else 1


if __name__ == "__main__":
    sys.exit(main())
