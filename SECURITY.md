# Security Policy

## Supported versions

Iris is in active development. Security patches land on `main`; published releases follow [SemVer](https://semver.org). At any time we support:

| Version | Supported |
|---|---|
| `main` (latest) | ✅ |
| Most recent minor (`vX.Y.*`) | ✅ |
| Older minors | ❌ — please upgrade |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security reports.**

Use [GitHub Security Advisories](https://github.com/RocketBus/clickbus-iris/security/advisories/new) — the "Report a vulnerability" button on the repo's Security tab. If your deployment configures `SECURITY_CONTACT_EMAIL`, you may also email that address.

Include:

- A description of the vulnerability and the impact you observed
- Steps to reproduce (PoC if possible) and affected versions
- Any suggested mitigation

You'll get an acknowledgement **within 72 hours** (business days). We'll then:

1. Confirm the report and assess severity (CVSS).
2. Develop a fix on a private branch.
3. Coordinate disclosure timing with you. Default is 90 days from confirmation, sooner if a public PoC exists.
4. Release the fix and credit the reporter (unless you prefer to remain anonymous).

For non-security bugs, use the standard [bug template](.github/ISSUE_TEMPLATE/bug.yml).

## Scope

In scope:
- The Python CLI (`iris/`) — including the prepare-commit-msg hook
- The Next.js platform (`platform/`) — including authentication, ingestion, and database queries
- Build and deployment scripts (`platform/VERCEL.md`, `.github/workflows/`)

Out of scope (please don't report):
- Issues that require physical access or compromise of the developer's machine
- Issues only affecting outdated, unsupported versions
- Findings from automated scanners without demonstrated impact
- Social engineering, phishing, or denial-of-service via traffic flooding

## Known issues

We track outstanding security advisories with Dependabot. Open security PRs and advisory acknowledgements live in the repository's [Security tab](https://github.com/RocketBus/clickbus-iris/security).

## Hardening defaults

Iris ships with secure defaults:
- `Strict-Transport-Security`, `X-Frame-Options: DENY`, and a tight `Content-Security-Policy` are enforced via `platform/next.config.ts`
- Supabase access uses the service-role key only on the server (never exposed to the client)
- NextAuth uses the JWT strategy with a project-specific `NEXTAUTH_SECRET`
- The ingestion API (`/api/ingest`) authenticates via `iris_*` API tokens, not session cookies
- CLI telemetry is **opt-in** — disabled unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set; see [docs/TELEMETRY.md](docs/TELEMETRY.md)
