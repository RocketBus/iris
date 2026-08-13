#!/bin/sh
# Iris AI Attribution Hook (prepare-commit-msg)
#
# Detects AI agent environment variables and appends a Co-Authored-By
# tag to the commit message BEFORE the commit is created.
#
# This is safer than post-commit + amend because:
# - No history rewriting (commit is born with the correct message)
# - No hash changes after creation
# - No GPG signature invalidation
# - No double CI triggers
# - If this hook fails, the commit proceeds without the tag (exit 0)
#
# Installed via: iris hook install

# Arguments from git:
#   $1 = path to the commit message file
#   $2 = source of the message (message, template, merge, squash, commit)
#   $3 = commit hash (only for amend)
COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="${2:-}"

# Skip on merge, squash, and amend — these already have their messages
case "$COMMIT_SOURCE" in
    merge|squash|commit) exit 0 ;;
esac

# --- Detect AI agent ---
# All detection is via environment variables. No subprocess calls.

AGENT_NAME=""
AGENT_EMAIL=""

# Domain for synthetic Co-Author emails. Override with IRIS_AGENT_EMAIL_DOMAIN.
# Default is "iris.invalid" (RFC 6761 reserved TLD — guaranteed never routable).
AGENT_EMAIL_DOMAIN="${IRIS_AGENT_EMAIL_DOMAIN:-iris.invalid}"

# 1. Vercel standard ($AI_AGENT)
if [ -n "$AI_AGENT" ]; then
    AGENT_NAME="$AI_AGENT"
    AGENT_EMAIL="$(printf '%s' "$AI_AGENT" | tr '[:upper:] ' '[:lower:]-')@${AGENT_EMAIL_DOMAIN}"

# 2. Claude Code
elif [ -n "$CLAUDE_CODE" ]; then
    AGENT_NAME="Claude Code"
    AGENT_EMAIL="claude-code@${AGENT_EMAIL_DOMAIN}"

# 3. Cursor
elif [ -n "$CURSOR_SESSION" ] || [ -n "$CURSOR_TRACE_ID" ]; then
    AGENT_NAME="Cursor"
    AGENT_EMAIL="cursor@${AGENT_EMAIL_DOMAIN}"

# 4. Windsurf
elif [ -n "$WINDSURF_SESSION" ]; then
    AGENT_NAME="Windsurf"
    AGENT_EMAIL="windsurf@${AGENT_EMAIL_DOMAIN}"

# 5. No agent detected — exit cleanly
else
    exit 0
fi

# --- Check if attribution already present in the message ---
# Read the current message file (may be a template or empty).
# Match by tool name so this works regardless of email domain — including
# legacy trailers from older domains.
#
# All three trailer keys the engine reads are accepted here: a repo whose
# policy already writes `Assisted-by:` (or a tool that writes `Made-with:`)
# is attributed, so appending a Co-Authored-By would only duplicate it.
#
# The key must start at column 0, like the engine requires: git only honours
# a trailer there, so an indented example inside the body is not attribution
# and must still get one appended.
#
# Tool names are bounded by a non-alphanumeric class instead of \b: POSIX ERE
# leaves \b undefined, so BSD/macOS grep may read it as a literal `b` (and
# 2>/dev/null would hide an error), and the class also treats `_` as a
# separator, matching agent names like `claude_code`. The bound keeps a human
# co-author (`Claudemir`) from suppressing attribution. If a grep degrades on
# the `$` inside the closing group, the worst case is a duplicated trailer —
# never a commit with no attribution.

if grep -qiE "^(Co-Authored-By|Assisted-by|Made-with):.*[^[:alnum:]](claude|anthropic|cursor|windsurf|copilot|codeium|tabnine|amazon-q|gemini|devin-ai)([^[:alnum:]]|$)" "$COMMIT_MSG_FILE" 2>/dev/null; then
    exit 0
fi

# --- Append Co-Authored-By to the message file ---
# This is a simple file append. No git commands, no side effects.

printf '\nCo-Authored-By: %s <%s>\n' "$AGENT_NAME" "$AGENT_EMAIL" >> "$COMMIT_MSG_FILE"

exit 0
