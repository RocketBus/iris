"""Flush spooled anonymous agent-usage records to the platform (issue #86).

Closes the loop between the edge recorder (#67) — which writes anonymous
``UsageRecord`` lines to ``~/.iris/agent-usage/spool.jsonl`` — and the ingest
endpoint ``POST /api/ingest/usage`` (#68). Only already-anonymous aggregates are
sent; transcripts never existed here.

Delivery is at-least-once and safe to retry: the server dedupes by the rotating
idempotency key, so re-sending a record that was received but whose local
truncation failed is harmless. On any network/server error the spool is left
intact for the next attempt.
"""

import json
import os
import urllib.error
import urllib.request

from iris.agent.recorder import SPOOL_FILE
from iris.agent.settings_hook import CONFIG_FLAG
from iris.platform.config import load_config

INGEST_PATH = "/api/ingest/usage"
BATCH_MAX = 500


def _read_spool_lines(spool_file: str) -> list[str]:
    if not os.path.isfile(spool_file):
        return []
    with open(spool_file, encoding="utf-8") as f:
        return [line for line in f.read().splitlines() if line.strip()]


def _drop_leading(spool_file: str, n: int) -> None:
    """Rewrite the spool keeping everything after the first ``n`` lines.

    ``record`` only ever appends, so the first ``n`` lines are exactly the ones
    just sent; any lines appended during the flush sit after them and survive.
    """
    remaining = _read_spool_lines(spool_file)[n:]
    if remaining:
        with open(spool_file, "w", encoding="utf-8") as f:
            f.write("\n".join(remaining) + "\n")
    elif os.path.isfile(spool_file):
        try:
            os.remove(spool_file)
        except OSError:
            pass


def _post(server_url: str, token: str, records: list, cli_version: str | None) -> dict:
    url = f"{server_url.rstrip('/')}{INGEST_PATH}"
    data = json.dumps({"records": records}).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    if cli_version:
        headers["User-Agent"] = f"iris/{cli_version}"
        headers["X-Iris-CLI-Version"] = cli_version

    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        hint = "\n\n  Your API token is invalid or revoked. Run: iris login" if e.code == 401 else ""
        raise RuntimeError(f"usage flush failed (HTTP {e.code}): {body}{hint}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"usage flush failed: {e.reason}") from e


def flush_spool(
    server_url: str,
    token: str,
    spool_file: str = SPOOL_FILE,
    cli_version: str | None = None,
    batch_max: int = BATCH_MAX,
    _post_fn=None,
) -> dict:
    """Send spooled records to the platform, draining the spool on success.

    Returns ``{"sent", "applied", "duplicates", "remaining"}``. Raises
    ``RuntimeError`` on a network/server failure, leaving unsent records spooled.
    ``_post_fn`` is a seam for tests to avoid real HTTP.
    """
    post = _post_fn or (lambda recs: _post(server_url, token, recs, cli_version))
    sent = applied = duplicates = 0

    # Drain in batches. The bound is a runaway guard, not an expected limit.
    for _ in range(10_000):
        lines = _read_spool_lines(spool_file)
        if not lines:
            break
        chunk = lines[:batch_max]
        records = []
        for line in chunk:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # drop malformed lines along with the batch
        if records:
            resp = post(records)
            applied += int(resp.get("applied", 0))
            duplicates += int(resp.get("duplicates", 0))
            sent += len(records)
        _drop_leading(spool_file, len(chunk))

    remaining = len(_read_spool_lines(spool_file))
    return {"sent": sent, "applied": applied, "duplicates": duplicates, "remaining": remaining}


def maybe_flush_quietly(
    server_url: str, token: str, cli_version: str | None = None
) -> dict | None:
    """Best-effort flush for piggybacking on ``push``.

    Runs only when telemetry is enabled and the spool is non-empty; swallows all
    errors so it can never disrupt a push. Returns the result dict or None.
    """
    try:
        if not load_config().get(CONFIG_FLAG):
            return None
        if not _read_spool_lines(SPOOL_FILE):
            return None
        return flush_spool(
            server_url, token, spool_file=SPOOL_FILE, cli_version=cli_version
        )
    except Exception:
        return None
