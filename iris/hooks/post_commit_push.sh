#!/bin/sh
# Iris auto-push: runs analysis and pushes to platform once per day.
# Runs in background to not block the commit.

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

# Run in background so we don't block the commit
(
    mkdir -p "$IRIS_DIR"
    "$IRIS_BIN" "$REPO_ROOT" --push --quiet 2>/dev/null && echo "$TODAY" > "$STAMP_FILE"
) &

exit 0
