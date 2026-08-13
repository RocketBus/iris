# AI Attribution Policy — Guide for Organizations

## Why Attribute AI-Assisted Code?

Most AI coding tools (Copilot, Cursor, Windsurf) don't leave traces in Git history. Without attribution, your organization is blind to how AI changes software delivery.

Three reasons to adopt attribution:

1. **Visibility** — Understand which code is AI-assisted and measure its durability. Iris analysis shows AI-assisted code can stabilize at 79% vs 64% for human code — but only when you can see it.

2. **Compliance** — The EU AI Act (enforcement August 2026) requires documentation of AI-generated content in production systems. Attribution in Git is the simplest audit trail.

3. **Improvement** — You can't improve what you can't measure. Knowing which AI tools produce the most durable code helps teams choose and configure tools effectively.

---

## How to Attribute

Add an attribution trailer to commit messages:

```
feat: add payment validation

Co-Authored-By: Claude Code <claude-code@iris.invalid>
```

This is the same format GitHub uses for co-authored commits. Iris reads these tags to classify commits by origin and tool.

### Accepted Trailer Keys

The ecosystem never settled on one key, so Iris reads three. Adopt whichever your policy already mandates — none is preferred over the others:

| Trailer | Who writes it |
|---|---|
| `Co-Authored-By:` | GitHub's convention, and what the Iris hook writes |
| `Assisted-by:` | orgs that attribute assistance without claiming co-authorship (e.g. ClickBus RFC 0020) |
| `Made-with:` | Cursor's agent — a bare tool name, no e-mail |

Only one trailer per commit is needed. If your policy already writes `Assisted-by:`, the Iris hook leaves the message alone instead of appending a second tag.

### Accepted Formats

| Tool | Example trailer |
|---|---|
| Claude Code | `Co-Authored-By: Claude Code <noreply@anthropic.com>` |
| GitHub Copilot | `Co-Authored-By: GitHub Copilot <copilot@github.com>` |
| Cursor | `Co-Authored-By: Cursor <cursor@iris.invalid>` (Iris hook) or `Made-with: Cursor` (Cursor's own agent) |
| Windsurf | `Co-Authored-By: Windsurf <windsurf@iris.invalid>` |
| Codeium | `Co-Authored-By: Codeium <codeium@iris.invalid>` |
| Amazon Q | `Co-Authored-By: Amazon Q <amazon-q@iris.invalid>` |
| Gemini | `Co-Authored-By: Gemini <gemini@iris.invalid>` |
| Devin | `Co-Authored-By: Devin AI <devin-ai-integration[bot]@users.noreply.github.com>` |

Iris matches the tool name as a whole word — bounded by any non-alphanumeric character — in either half of the trailer value (display name or e-mail), case-insensitive. A human co-author whose name merely contains the substring (`Claudemir`, `Geminiano`) is therefore not classified as AI. For the same reason `devin` alone does not count: only the `devin-ai` marker does. Any key from the table above works with any tool.

The trailer must also start at the beginning of the line, as git requires for a trailer (`git interpret-trailers` ignores an indented line). A trailer quoted inside an indented block in the commit body is an example, not attribution, and does not count.

---

## Option 1: Automated (Recommended)

Install the Iris hook — it detects AI tools via environment variables and adds the tag automatically:

```bash
iris hook install /path/to/repo
```

The hook runs as `prepare-commit-msg` — it appends the Co-Authored-By **before** the commit is created. No history rewriting, no amend, no side effects. If the hook fails, the commit proceeds normally.

**What it detects:**

| Environment Variable | Tool |
|---|---|
| `$CLAUDE_CODE` | Claude Code |
| `$AI_AGENT` | Vercel standard (any tool) |
| `$CURSOR_SESSION` or `$CURSOR_TRACE_ID` | Cursor |
| `$WINDSURF_SESSION` | Windsurf |

**To install across all repos in an org:**

```bash
for repo in /path/to/org/*/; do
  iris hook install "$repo" 2>/dev/null && echo "Installed: $repo"
done
```

---

## Option 2: Git Template (Manual)

Configure a commit message template that reminds developers to attribute:

```bash
git config --global commit.template ~/.git-commit-template
```

Create `~/.git-commit-template`:

```


# If this commit was AI-assisted, uncomment the appropriate line:
# Co-Authored-By: GitHub Copilot <copilot@github.com>
# Co-Authored-By: Claude Code <noreply@anthropic.com>
# Co-Authored-By: Cursor <cursor@iris.invalid>
```

---

## Option 3: IDE Snippets

### VS Code (settings.json)

```json
{
  "git.inputValidation": "always",
  "git.inputValidationSubjectLength": null
}
```

Add a snippet (`Preferences > User Snippets > plaintext`):

```json
{
  "AI Co-Author (Copilot)": {
    "prefix": "coai",
    "body": "Co-Authored-By: GitHub Copilot <copilot@github.com>"
  },
  "AI Co-Author (Claude)": {
    "prefix": "coclaude",
    "body": "Co-Authored-By: Claude Code <noreply@anthropic.com>"
  }
}
```

### Git Alias

```bash
git config --global alias.ai-commit '!f() { git commit -m "$1

Co-Authored-By: Claude Code <noreply@anthropic.com>"; }; f'
```

Usage: `git ai-commit "feat: add payment flow"`

---

## Measuring Attribution Coverage

Iris reports **AI detection coverage** as a percentage:

```
> AI detection coverage: 34% of commits have AI attribution.
```

And flags **attribution gaps** — commits with high-velocity patterns but no attribution:

```
## Attribution Gap

72 commits (45%) match high-velocity patterns but have no AI attribution.
These commits average 267 avg LOC, 7.1 avg files, 13min avg interval.

This does not confirm AI usage — but the pattern is uncommon for
manual development. Consider: iris hook install
```

Target: reduce the attribution gap to <10% across the organization.

---

## What NOT to Do

- **Don't force attribution retroactively** — only apply going forward
- **Don't use attribution for individual evaluation** — Iris analyzes systems, not people
- **Don't attribute partial AI assistance** — if Copilot suggested 2 lines in a 200-line commit, judgment call. When in doubt, attribute.
- **Don't block commits without attribution** — the hook is non-blocking by design. Attribution should be opt-in culture, not enforcement.

---

## Policy Template

Copy this to your organization's engineering handbook or wiki:

> **AI Attribution Policy**
>
> All code produced with significant AI assistance should include a `Co-Authored-By` tag in the commit message identifying the tool used. This helps us understand how AI tools affect our delivery quality and meets emerging compliance requirements.
>
> **How:** Install the Iris hook (`iris hook install .`) or manually add the tag.
>
> **When:** When AI generated or substantially modified the code in the commit.
>
> **Why:** Visibility, measurement, and compliance — not surveillance or evaluation.
>
> This is a team practice, not an individual mandate. No commit will be rejected for missing attribution.

---

## References

- [SSW Rules: Attribute AI-assisted commits](https://www.ssw.com.au/rules/attribute-ai-assisted-commits-with-co-authors/)
- [EU AI Act](https://artificialintelligenceact.eu/) — enforcement timeline August 2026
- [Vercel detect-agent](https://www.npmjs.com/package/@vercel/detect-agent) — $AI_AGENT standard
