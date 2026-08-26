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

# A hook library may run this under `sh -e`, where a top-level command
# returning non-zero aborts the script — and aborting prepare-commit-msg
# aborts the commit. Nothing below trips that today: every no-match `grep`
# either sits in an `if` condition or ends a pipeline, both of which errexit
# ignores. That safety is incidental, though, and one future assignment away
# from costing a user their commit, so it is made explicit instead of assumed.
set +e

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
# Only the body is scanned — the same slice the engine reads (`%b`, the message
# minus its first paragraph): a trailer glued to the subject is folded into
# `%s`, so the engine would see no attribution and the hook must append one.
# The separator address tolerates blanks so a line carrying only whitespace
# still ends the first paragraph — including the lone `\r` of a CRLF message,
# where a bare `/^$/` would find no separator and drop the whole file.
#
# Tool names are bounded by a non-alphanumeric class instead of \b: POSIX ERE
# leaves \b undefined, so BSD/macOS grep may read it as a literal `b` (and
# 2>/dev/null would hide an error), and the class also treats `_` as a
# separator, matching agent names like `claude_code`. The bound keeps a human
# co-author (`Claudemir`) from suppressing attribution. If a grep degrades on
# the `$` inside the closing group, the worst case is a duplicated trailer —
# never a commit with no attribution.
#
# The left bound also accepts leading blanks because the key's `:` is consumed
# by the pattern, so without that branch a value glued to the colon
# (`Made-with:Cursor`) would have no boundary left to match.

if sed '1,/^[[:space:]]*$/d' "$COMMIT_MSG_FILE" 2>/dev/null | grep -qiE "^(Co-Authored-By|Assisted-by|Made-with):([[:space:]]*|.*[^[:alnum:]])(claude|anthropic|cursor|windsurf|copilot|codeium|tabnine|amazon-q|gemini|devin[- ]?ai)([^[:alnum:]]|$)"; then
    exit 0
fi

# --- Write Co-Authored-By into the message file ---
# No git commands, no side effects.
#
# Under `commit.verbose` (or `git commit -v`) git has already written the
# scissors line and the diff into the file before this hook runs, and
# `cleanup=scissors` drops everything from that line down — an append would
# land below it and the commit would be born with no attribution at all. So
# the trailer is inserted above the scissors line whenever one is present.
#
# The scissors line is recognised by the hyphen runs around `>8` rather than by
# the comment character, which `core.commentChar` makes configurable. Requiring
# the runs, and nothing after the closing one, keeps body prose mentioning `>8`
# from being taken for it.
#
# A non-numeric grep result (older greps announce "Binary file ... matches" on
# stdout) is discarded: feeding it to `$(( ))` would abort the shell and fail
# the commit.

SCISSORS_LINE="$(grep -nE '[-]{5,}[[:space:]]+>8[[:space:]]+[-]{5,}[[:space:]]*$' "$COMMIT_MSG_FILE" 2>/dev/null | head -n 1)"
SCISSORS_LINE="${SCISSORS_LINE%%:*}"
case "$SCISSORS_LINE" in
    ''|*[![:digit:]]*) SCISSORS_LINE="" ;;
esac

# The rewrite goes to a temporary file beside the message file and is moved
# over it, so a failure in any step leaves the original message untouched —
# and the temporary file is removed either way.
if [ -n "$SCISSORS_LINE" ]; then
    TMP_MSG_FILE="${COMMIT_MSG_FILE}.iris.$$"
    if {
        head -n "$((SCISSORS_LINE - 1))" "$COMMIT_MSG_FILE" &&
        printf '\nCo-Authored-By: %s <%s>\n' "$AGENT_NAME" "$AGENT_EMAIL" &&
        tail -n "+$SCISSORS_LINE" "$COMMIT_MSG_FILE"
    } > "$TMP_MSG_FILE" 2>/dev/null; then
        mv "$TMP_MSG_FILE" "$COMMIT_MSG_FILE" 2>/dev/null
    fi
    rm -f "$TMP_MSG_FILE" 2>/dev/null
    exit 0
fi

printf '\nCo-Authored-By: %s <%s>\n' "$AGENT_NAME" "$AGENT_EMAIL" >> "$COMMIT_MSG_FILE"

exit 0
