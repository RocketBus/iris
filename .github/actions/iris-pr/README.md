# Iris PR Insights — GitHub Action

Analyze a pull request with Iris and post AI-aware engineering insights as a PR
comment, automatically, on every PR.

## Setup

Copy this workflow into the consuming repository as
`.github/workflows/iris.yml`:

```yaml
name: Iris PR Insights

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  iris-pr:
    name: Iris PR Analysis
    runs-on: ubuntu-latest
    permissions:
      contents: read        # required: actions/checkout reads the repo
      pull-requests: write  # required: post the insights comment
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0     # full history → churn / cascade context

      - uses: RocketBus/clickbus-iris/.github/actions/iris-pr@main
```

## Important: the `permissions` block

The moment you declare a `permissions:` block, **every permission you do not
list is set to `none`** — not the default `read`. Iris needs both:

- `contents: read` — without it, `actions/checkout` cannot read the repo. On a
  **private** repo this surfaces as a confusing `remote: Repository not found`
  / `fatal: repository '...' not found` (GitHub returns 404, not 403, to a
  token that lacks access). This is the most common setup failure.
- `pull-requests: write` — without it, the final `gh pr comment` step fails.

If you omit the `permissions:` block entirely, the workflow inherits the
repository's default token permissions, which may or may not include
`pull-requests: write`. Declaring both explicitly is the reliable setup.

## Inputs

| Input | Default | Description |
|---|---|---|
| `pr-number` | event context | PR number (auto-detected from the `pull_request` event) |
| `churn-days` | `14` | Churn context window in days |
| `python-version` | `3.11` | Python version to install |

Example with overrides:

```yaml
      - uses: RocketBus/clickbus-iris/.github/actions/iris-pr@main
        with:
          churn-days: '30'
          python-version: '3.12'
```

## Notes

- `fetch-depth: 0` gives Iris full history for churn and cascade context. With a
  shallow clone the action degrades gracefully and runs with `--no-context`.
- `@main` always runs the latest action. Pin to a tag or commit SHA if you need
  reproducible behavior across runs.
