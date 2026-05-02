"""Push metrics to the Iris platform."""

import json
import urllib.request
import urllib.error


def push_metrics(
    server_url: str,
    token: str,
    repository: str,
    metrics_path: str,
    window_days: int = 90,
    remote_url: str | None = None,
    cli_version: str | None = None,
    github_user: str | None = None,
    active_users: list[str] | None = None,
) -> dict:
    """Push a metrics.json file to the Iris platform.

    Returns the server response as a dict.
    Raises RuntimeError on failure.
    """
    with open(metrics_path) as f:
        metrics = json.load(f)

    payload = {
        "repository": repository,
        "window_days": window_days,
        "metrics": metrics,
    }
    if remote_url:
        payload["remote_url"] = remote_url
    if cli_version:
        payload["cli_version"] = cli_version
    if github_user:
        payload["github_user"] = github_user
    if active_users:
        payload["active_users"] = active_users

    url = f"{server_url.rstrip('/')}/api/ingest"
    data = json.dumps(payload).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    if cli_version:
        headers["User-Agent"] = f"iris/{cli_version}"
        headers["X-Iris-CLI-Version"] = cli_version

    req = urllib.request.Request(
        url,
        data=data,
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        hint = ""
        if e.code == 401:
            hint = (
                "\n\n  Your API token is invalid or has been revoked.\n"
                "  Run: iris login"
            )
        elif e.code == 400:
            hint = (
                "\n\n  The metrics payload was rejected by the server.\n"
                "  Make sure you are using the latest CLI version."
            )
        raise RuntimeError(f"Push failed (HTTP {e.code}): {body}{hint}") from e
    except urllib.error.URLError as e:
        reason = str(e.reason)
        if "CERTIFICATE_VERIFY_FAILED" in reason:
            raise RuntimeError(
                f"Push failed: SSL certificate verification failed.\n\n"
                f"  Your Python installation cannot verify the server's SSL certificate.\n"
                f"  Common fixes:\n\n"
                f"    # macOS — install system certificates for your Python:\n"
                f"    /Applications/Python\\ 3.*/Install\\ Certificates.command\n\n"
                f"    # Or set the cert bundle from certifi:\n"
                f"    pip install certifi\n"
                f"    export SSL_CERT_FILE=$(python3 -c \"import certifi; print(certifi.where())\")\n\n"
                f"  Then run the command again."
            ) from e
        raise RuntimeError(f"Push failed: {e.reason}") from e
