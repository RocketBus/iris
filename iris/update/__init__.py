"""Silent CLI self-update (opt-out).

Mirrors the agent-telemetry consent pattern: default-on once, with a clear
first-run disclosure and an easy opt-out. The actual upgrade reuses the same
``install.sh`` the user already trusted at install time — so this adds no new
trust surface, it just repeats that step automatically.
"""
