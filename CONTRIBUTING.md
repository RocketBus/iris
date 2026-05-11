# Contributing to Iris

Thanks for considering a contribution. Iris is open source under Apache 2.0 and welcomes pull requests, issues, and discussions.

## Project layout

```
iris/                  # repo root
├── iris/              # Python CLI (the analysis engine)
├── platform/          # Next.js app (multi-tenant dashboard)
├── docs/              # Architecture, methodology, principles
├── tests/             # Python pytest suite (CLI)
├── examples/          # Sample reports and fixtures
└── supabase/          # Project-level Supabase config
```

The CLI and the platform ship independently:
- **CLI** wheels are published as GitHub Release assets and installed via the `install.sh`/`install.ps1` scripts served by the platform.
- **Platform** is deployed to Vercel; see `platform/VERCEL.md`.

## Local setup

### 1. Python CLI

```bash
git clone git@github.com:RocketBus/clickbus-iris.git iris
cd iris
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
pip install pytest

# Verify
iris --help
pytest tests/ -q
```

Requirements: Python 3.11+, Git, optional `gh` CLI for PR analysis.

### 2. Platform (Next.js)

```bash
cd platform
npm install --legacy-peer-deps

# Copy env.example → .env.local and fill in your own Supabase / NextAuth secrets
cp env.example .env.local
$EDITOR .env.local

npm run dev
```

The first `npm install` also installs the Husky pre-commit hook (`platform/.husky/pre-commit`) which runs `lint-staged` on changed files.

Optional: `npx supabase start` to run a local Postgres mirror of the schema in `platform/supabase/migrations/`.

## Common commands

In `platform/`:

```bash
npm run dev               # dev server (Turbopack)
npm run build             # production build
npm run lint              # eslint --fix
npm run test              # vitest (unit tests)
npm run test:coverage     # vitest with coverage report
npx tsc --noEmit          # type check
npm run format            # prettier write
```

In repo root (Python):

```bash
pytest tests/ -q          # full Python test suite
iris /path/to/repo        # run the CLI on a real repo
```

## Pull request workflow

1. **Open an issue first** for non-trivial changes. Use the templates in `.github/ISSUE_TEMPLATE/`. Trivial fixes (typos, doc tweaks) don't need an issue.
2. **Fork** the repo, branch from `main` (`feat/...`, `fix/...`, `docs/...`).
3. **Commit** following [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`. Keep commits focused.
4. **Run locally** before pushing: `npm run lint && npx tsc --noEmit && npm run test:coverage` in `platform/`, plus `pytest tests/ -q` from repo root.
5. **Open a PR** against `main`. Fill out the description (what + why). The CI workflow at `.github/workflows/ci.yml` will run lint, type check, and tests automatically.
6. **Reviews**: at least one approval from a maintainer required. Address feedback in additional commits (don't force-push during review).
7. **Merge**: squash-merge by default; the PR title becomes the commit message.

## Adding a new metric (full chain)

When introducing a new analysis metric, complete the entire chain so it surfaces in reports and the platform:

1. `iris/analysis/<metric>.py` — analysis module
2. `iris/metrics/aggregator.py` — wire it in
3. `iris/models/metrics.py` — Python schema (dataclass)
4. `iris/reports/writer.py` — Markdown report writer
5. `iris/reports/narrative.py` — narrative finding (if threshold-based)
6. `platform/src/types/metrics.ts` — TypeScript schema
7. `platform/src/app/[tenant]/...` — UI surface (if visible in the dashboard)
8. `docs/METRICS.md` — entry in the canonical metric dictionary

The `metric.yml` issue template enforces this checklist.

## Style conventions

- **TypeScript**: ESLint + Prettier handle formatting. Strict mode enabled.
- **Python**: PEP 8, 4-space indent. Small, readable functions.
- **Comments**: only when the *why* is non-obvious. Don't restate what the code does.
- **Tests**: integration tests favor real DBs over mocks for migrations; unit tests for analysis modules.

## Dogfooding

Iris analyzes its own repo as a release sanity check:

```bash
iris .
```

If your PR touches the engine, include the resulting `out/90d/` summary in the PR description.

## Reporting security issues

Please don't open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## License

By submitting a contribution, you agree that your work will be licensed under the project's [Apache License 2.0](LICENSE).
