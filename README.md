# Auvrion Biosphere

Auvrion Biosphere is Team Pais Patin's prototype for UINIC 8.0 Web Development
2026. It aims to support biodiversity and forest-fire monitoring through
traceable observations, human review, field verification and documented outcomes.

## Implementation status

G1A is **functionally complete — security decision pending**. The static,
responsive under-development homepage uses Next.js App Router, React Server
Components, strict TypeScript, Tailwind and system fonts. Chromium smoke tests
cover HTTP status, title/content, narrow/wide layouts, keyboard navigation and
uncaught browser errors. Wider architecture decisions remain Proposed; no
operational monitoring workflows are implemented.

G1B adds a minimal `GET /api/health` liveness route and a server-only, local
PostgreSQL/Drizzle connection foundation. The temporary homepage is preserved;
the Tech Lead will design the product UI separately in Figma Make. No domain
schema, authentication or database-backed application feature exists yet.

The full dependency audit reports five High development-package findings from
one [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), with no
published patched version. The production-only audit reports zero findings.
[ESLint 9 is also end-of-life](https://eslint.org/version-support/). ESLint 10.12.0
supports Node 24, but the required React/accessibility/import plugins do not
declare ESLint 10 compatibility. The existing pins are retained. Do not run an
audit force-fix or silently change the approved versions.

The affected path is `eslint-config-next → @next/eslint-plugin-next → fast-glob →
micromatch → braces@3.0.3`. Current Next lint settings leave `rootDir` unset;
inspection and page-lint instrumentation found no fast-glob calls. Production
server traces contain none of these lint packages. This assessment applies only
to the current code/configuration; it does not resolve the advisory.

**Exception proposal, NOT APPROVED:** retain this development-only lint stack
until **22 October 2026, 18:00 WIB** (19:00 WITA), with earlier review on any
dependency/configuration change. The Tech Lead must approve the residual risk.
Use only the fixed lint command in a trusted working tree; do not accept external
root-directory/glob patterns, invoke lint from an HTTP endpoint, or run unreviewed
configurations with privileged credentials. Keep the full audit visible. Retest
when a maintained compatible lint stack or patched dependency is available.

The Tech Lead is the sole developer and technical decision owner, responsible for
code, security, testing and operations. The Financial Lead and Pitch Lead support
finance, procurement, research, presentation and nontechnical UAT. Work proceeds
one small engineering slice at a time.

## Canonical engineering references

- [Engineering & Delivery — ER-01](https://app.notion.com/p/3f873f8cd49981898cb6e54d3d5119b6): primary execution reference, readiness gates and delivery sequence.
- [Technology Stack Evaluation](https://app.notion.com/p/3f873f8cd49981889d00e996dcd5cf3b): current candidate and compatibility decisions.
- [Architecture Decision Records](https://app.notion.com/p/3f873f8cd49981129251cc56bd616b65): all eight ADRs remain Proposed.
- [Security Architecture & Threat Model](https://app.notion.com/p/3f873f8cd49981d485a0cbc97a37e673): security controls and release blockers.

This README is a repository guide, not a replacement for canonical decisions.

## Proposed architecture and foundation scope

The preferred candidate is a Next.js App Router full-stack modular monolith with
React, strict TypeScript and Tailwind/shadcn/ui. Later slices may introduce
centralized authorization, Zod, domain services/repositories, Better Auth,
PostgreSQL/PostGIS-backed domain schemas, MapLibre and additional testing. An
economical VPS with private database/media and encrypted off-VPS backups is a
deployment candidate. None of these wider choices is automatically approved.

G1A is limited to Next.js, React, TypeScript, Tailwind, ESLint, one npm lockfile,
an accessible under-development page and basic verification. Authentication,
database, GIS, AI, IoT, workers and deployment remain outside this bootstrap.
Server Components are the default; create modules only when an approved slice
needs them. AI and sensor indicators never autonomously confirm findings or fire
incidents. Delayed device synchronization is not remote real-time early warning.

## Environment and verification

- Node.js **24.22.0**, recorded in `.nvmrc`.
- npm **11.19.1**; use npm consistently and commit one `package-lock.json` when generated.
- Git; Windows development may use PowerShell or Git Bash with nvm-windows.

With nvm-windows, select the version explicitly with `nvm use 24.22.0`; `.nvmrc`
records the intended runtime. Check `node --version` and `npm --version` before
working. To install the locked dependencies and Chromium, then verify locally:

```powershell
npm ci
npm exec -- playwright install chromium
npm run lint
npm run typecheck
npm run build
npm run test:e2e
npm audit
npm audit --omit=dev
git diff --check
```

`npm run dev` serves <http://127.0.0.1:3000>; stop it with Ctrl+C. `npm run start`
serves the production build. Playwright starts an isolated production server on
port 4173 and stops it afterward; it does not reuse an existing server. Reports
and screenshots are under ignored `playwright-report/` and `test-results/`.
Homepage and health verification need no credentials or `.env` file.
`next-env.d.ts` is generated and ignored; type checking regenerates it.

Verification on 15 October 2026: clean install, dependency-tree checks, lint,
typecheck, production build, development HTTP 200 and both Chromium viewport
tests succeeded. Full audit exits 1 with the documented High findings; production
audit exits 0. Sandbox restrictions required build/browser/localhost checks
outside the sandbox. These checks do not establish production release readiness.

## Local backend foundation

`GET /api/health` returns only `{"status":"ok"}` with HTTP 200, JSON content type
and `Cache-Control: no-store`. It is public liveness only: it does not check the
database or disclose diagnostics. Homepage and health checks work without
`DATABASE_URL` or a running database.

Runtime additions are pinned to `pg@8.23.1` (MIT), `drizzle-orm@0.45.4`
(Apache-2.0) and `server-only@0.0.1` (MIT); `@types/pg@8.23.1` is declared as a
development dependency (MIT). The driver supports Node 24 and Drizzle's `pg >=8`
peer range.

The Tech Lead chose to **defer Drizzle Kit**. Stable `drizzle-kit@0.31.11` pulls
in `@esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild@0.18.20`, affected
by [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
(Moderate, esbuild development-server source disclosure; fixed in 0.25.0).
No override or exception was applied. `drizzle.config.ts` prepares the PostgreSQL
configuration format, without schema paths or migration scripts; it is not an
executed migration-tool verification. Review a patched supported Kit dependency
path and approve initial data contracts before enabling migration commands.

For a dedicated local development database, copy `.env.example` to ignored
`.env.local` and set `DATABASE_URL` privately. Use a URL-encoded password.
Only `127.0.0.1`, `localhost` and IPv6 loopback are accepted in this slice;
URL query overrides/fragments are rejected. Remote/TLS deployment configuration
needs a later review. Never use a production connection string here.

```powershell
npm run test:server
npm run db:check
```

`db:check` loads optional `.env.local` using Node 24, reuses the actual connection
module and runs catalog queries in a read-only transaction. It reports only
connectivity and whether PostGIS is available and enabled. Exit 0 means both
checks are ready; exit 1 means configuration/connectivity failed; exit 2 means
connectivity succeeded but PostGIS is unavailable or not enabled. It never
creates an extension or database object. Do not enable PostGIS on an existing
database without checking ownership and obtaining approval.

`src/server/db` uses `server-only` markers, a lazy bounded pool (five connections)
reused across hot reloads, five-second connection/query limits and no SQL logging.
The local CLI and Node tests explicitly select the `react-server` condition;
native `.mts` execution avoids another TypeScript runner. Import extensions are
allowed for type checking with the existing `noEmit` configuration. Errors from
the driver must be caught by future application services/controllers and mapped
to generic responses; never return or log raw errors, query parameters or URLs.
The CLI already redacts failure details and closes its pool.

Docker CLI is installed but its Linux engine is unavailable; local PostgreSQL
tools report version 16.2 and nothing responded on localhost:5432. No database
credentials were present and no database or container was created. Live
connectivity, PostGIS and migration execution remain unverified. Provision a
dedicated, patched local PostgreSQL/PostGIS runtime before live integration
testing; local environment setup is separate from production deployment.

G1B verification on 15 October 2026: locked clean install, both dependency-tree
checks, lint, typecheck, production build, six Node server tests and all four
Playwright checks passed. Development startup returned HTTP 200 for the homepage
and health route; test servers were stopped. With no credentials configured,
`db:check` exited 1 with a generic message, as expected. This verifies the failure
path, not live connectivity. Fresh full audit still reports five High findings;
production audit reports zero. Deferring Kit avoids adding its esbuild finding.

## Security and review rules

- Keep credentials, tokens, environment files, private media and database dumps
  out of Git, browser bundles and logs. `.env.example` may contain public variable
  names or dummy guidance only. The only current name is server-side `DATABASE_URL`.
- Keep `.env*` ignored except `.env.example`. Values prefixed `NEXT_PUBLIC_` are
  public; never put a secret there. Private media must stay outside `public`.
- Use supported patched dependencies, inspect lockfile changes and review audit
  findings. Do not bypass security or type checks to make a build succeed.
- Keep stable `main`; use a short-lived branch per bounded slice. Current branch:
  `chore/engineering-foundation`. Review scope, secret exposure, failure paths,
  test evidence and rollback impact before merge. Solo review is not independent
  security review.
- Use small descriptive commits, for example `chore: prepare engineering foundation`.
  Commits, pushes and deployment require separate authorization. Record actual
  checks and limitations; never present planned tests as passed.

## Readiness boundaries and milestones

- **G0:** neutral repository initialization and guardrails; the repository exists.
- **G1:** targeted stack and security-policy approvals. G1A covers only the bounded
  framework/toolchain bootstrap; G1B adds liveness and local database wiring.
  Authentication, assurance, activation, recovery,
  administrator bootstrap and judge access need subsequent approval before the
  protected slice.
- **G2:** each feature requires approved actors, permissions, data boundaries and
  legal state transitions. No domain implementation is authorized by G1A.
- **G3:** online release requires executed security/test evidence, deployment
  verification, actual backup/restore and rollback checks. UNKNOWN is not PASS.

Internal feature freeze target: **25 October 2026, 18:00 WIB** (19:00 WITA).
Submission deadline: **30 October 2026, 23:59 WIB** (31 October, 00:59 WITA).
Deadline pressure does not permit security shortcuts or unsupported feature claims.
