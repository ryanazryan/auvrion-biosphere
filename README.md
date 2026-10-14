# Auvrion Biosphere

Auvrion Biosphere is Team Pais Patin's prototype for UINIC 8.0 Web Development
2026. It aims to support biodiversity and forest-fire monitoring through
traceable observations, human review, field verification and documented outcomes.

## Implementation status

G1A is partially scaffolded: the approved direct dependencies, one npm lockfile,
and TypeScript/Next.js/Tailwind/ESLint configuration exist. The homepage and
executable tests are not implemented; no application test has been executed.
Implementation stopped at the dependency security gate. Wider architecture
decisions remain Proposed.

The full dependency audit reports five High development-package findings from
one [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), with no
published patched version. The production-only audit reports zero findings.
[ESLint 9 is also end-of-life](https://eslint.org/version-support/). A separately
approved tooling resolution is required before continuing. Do not run an audit
force-fix or silently change the approved versions.

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
React, strict TypeScript and Tailwind/shadcn/ui. Later slices may introduce thin
Route Handlers, centralized authorization, Zod, domain services/repositories,
Better Auth, Drizzle, PostgreSQL/PostGIS, MapLibre and Vitest/Playwright. An
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
working. The manifest declares dev, lint, typecheck, build and e2e scripts, but the
application/test files are incomplete, so these checks are not verified yet.
Inspect the current dependency state with:

```powershell
npm ls --depth=0
npm ls sharp --all
npm explain braces
npm audit
npm audit --omit=dev
git diff --check
```

After the tooling blocker is resolved, verify `npm ci`, `npm run lint`,
`npm run typecheck`, `npm run build`, local HTTP startup and Chromium e2e tests.
No browser binaries have been downloaded. No credentials or `.env` file are
required for the placeholder bootstrap.

## Security and review rules

- Keep credentials, tokens, environment files, private media and database dumps
  out of Git, browser bundles and logs. `.env.example` may contain public variable
  names or dummy guidance only; no variables are needed yet.
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
  framework/toolchain bootstrap; authentication, assurance, activation, recovery,
  administrator bootstrap and judge access need subsequent approval before the
  protected slice.
- **G2:** each feature requires approved actors, permissions, data boundaries and
  legal state transitions. No domain implementation is authorized by G1A.
- **G3:** online release requires executed security/test evidence, deployment
  verification, actual backup/restore and rollback checks. UNKNOWN is not PASS.

Internal feature freeze target: **25 October 2026, 18:00 WIB** (19:00 WITA).
Submission deadline: **30 October 2026, 23:59 WIB** (31 October, 00:59 WITA).
Deadline pressure does not permit security shortcuts or unsupported feature claims.
