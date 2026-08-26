#!/bin/sh
# Iris auto-push: runs analysis and pushes to platform once per day.
# Runs in background to not block the commit.

# A hook library may run this under `sh -e`, where a top-level command
# returning non-zero aborts the script — reported to the user as a failed hook.
# The token probe below is exactly that shape: `TOKEN=$(grep ...)` is an
# assignment, not a pipeline, so on a config with no token errexit would take
# the hook down instead of letting it exit quietly. Errexit is turned off here;
# every branch exits 0 explicitly.
set +e

IRIS_DIR="$HOME/.iris"
STAMP_FILE="$IRIS_DIR/.last_push_$(basename "$(git rev-parse --show-toplevel)" 2>/dev/null | tr '/' '_')"
TODAY=$(date +%Y-%m-%d)

# Check if already pushed today
if [ -f "$STAMP_FILE" ]; then
    LAST_PUSH=$(cat "$STAMP_FILE" 2>/dev/null)
    if [ "$LAST_PUSH" = "$TODAY" ]; then
        exit 0
    fi
fi

# Check if iris is available and authenticated
IRIS_BIN=""
for candidate in "$IRIS_DIR/bin/iris" "$IRIS_DIR/venv/bin/iris" "$(command -v iris 2>/dev/null)"; do
    if [ -x "$candidate" ]; then
        IRIS_BIN="$candidate"
        break
    fi
done

if [ -z "$IRIS_BIN" ]; then
    exit 0
fi

# Check auth config exists
if [ ! -f "$IRIS_DIR/config.json" ]; then
    exit 0
fi

# Check token is configured
TOKEN=$(grep -o '"token"' "$IRIS_DIR/config.json" 2>/dev/null)
if [ -z "$TOKEN" ]; then
    exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
    exit 0
fi

# Run in background so we don't block the commit.
#
# Both streams are redirected, not just stderr. The analysis takes ~10-15s and
# outlives the commit, so by the time it writes, the terminal's stdout may be
# gone — the resulting EPIPE would kill the run before it stamps the file, and
# the push would be retried on every commit, forever. Discarding stdout keeps
# the descriptor valid for the whole run.
#
# There is no --quiet flag: passing one made argparse reject the whole command
# with a usage error that the stderr redirect then swallowed, so the push never
# ran and the failure was invisible.
(
    mkdir -p "$IRIS_DIR"
    "$IRIS_BIN" "$REPO_ROOT" --push >/dev/null 2>&1 && echo "$TODAY" > "$STAMP_FILE"
) &

exit 0
