# AB-WC-014 — UI regression, keyboard, responsive and error state acceptance

**Status: IN REVIEW — automated regression passed; manual acceptance and reviewer approval pending.**

Canonical Work Control: https://app.notion.com/p/3fa73f8cd499815a945af104e44c29dd
Requirement refs: AB-NFR-GIS-001, AB-NFR-PLATFORM-002, TC-33.
Scope: Operator, Supervisor, Ranger core workspaces; map textual alternative; form failure/retry; responsive viewport evidence.

## Test protocol

1. From an up-to-date `develop` worktree, install dependencies, run lint, typecheck, Vitest and production build.
2. For browser tests, use `npm run dev` with a local test database and **approved test accounts** for Operator, Supervisor and Ranger. Use `localhost:3000` consistently for cookies.
3. Install browser QA tooling: `npm install --save-dev @playwright/test` and `npx playwright install chromium`.
4. Record each session using the browser codegen `--save-storage` workflow, e.g. `npx playwright codegen --save-storage=e2e/.auth/operator.json http://localhost:3000/login`. Complete login+MFA manually with a non-production test account; close the browser to save state. Repeat for supervisor/ranger. Files in `e2e/.auth` are **secrets**, gitignored, and must never be uploaded.
5. Run `npx playwright test --config=playwright.config.ts`, then `npx playwright show-report`.
6. Inspect each skipped/failed test; record screenshots/traces locally, scrub credentials, user data and protected coordinates. **Skipped suites are NOT passing evidence.**
7. Manually test scenarios not covered by the automated suite (below). Do not claim WCAG conformance from this suite.

## Viewports

- Mobile: 360 × 800 (Ranger field operations are mobile first).
- Tablet: 768 × 1024.
- Desktop: 1366 × 768.

## Acceptance matrix (update after real execution)

| ID | Role / scenario | Expected | State | Actual result / evidence |
|---|---|---|---|---|
| WC014-01 | Operator, Supervisor, Ranger landing, all viewports | Main workspace visible, no page-level horizontal overflow | NOT RUN | — |
| WC014-02 | Operator mobile drawer | Focus moves inside; Tab remains inside; Escape closes and returns focus | NOT RUN | — |
| WC014-03 | Supervisor mobile drawer | Focus moves inside; Tab remains inside; Escape closes and returns focus | NOT RUN | — |
| WC014-04 | Ranger mobile account menu | Escape dismisses and returns focus; touch targets usable | NOT RUN | — |
| WC014-05 | Operator GIS table alternative | Textual table accessible without interactive map or coordinates leakage | NOT RUN | — |
| WC014-06 | GIS API 503 | Error announced; retry offered; no fabricated success | NOT RUN | — |
| WC014-07 | Supervisor decision form | Required labels, validation, conflict/forbidden and recovery behavior checked | NOT RUN | — |
| WC014-08 | Ranger finding and photo upload | Empty/loading/error states, disabled network and recoverability | NOT RUN | — |
| WC014-09 | Operator intake | Empty/error states; no accidental double-submit; keyboard flow | NOT RUN | — |
| WC014-10 | Operator, Supervisor, Ranger deep links | Invalid role/scope denied; no privileged data exposed | NOT RUN | — |
| WC014-11 | Map fallback without tiles/network | Textual table usable; protected coordinates never exposed | NOT RUN | — |
| WC014-12 | Screen reader/keyboard manual pass | Visible focus, descriptive labels, readable announcements | NOT RUN | — |

## Evidence template for each test

- Date / timezone:
- Commit SHA / branch:
- Environment and browser version:
- Test fixture IDs (sanitized):
- Role and viewport:
- Steps:
- Expected / actual:
- PASS / FAIL / BLOCKED:
- Artifact location (scrubbed):
- Defect/fix PR:
- Reviewer approval:

## Definition of Done

All applicable scenarios pass or have explicit reviewed disposition; lint/typecheck/unit/integration/build evidence retained; Playwright authorized-role suites run rather than skip; keyboard/screen reader and degraded network checks performed; no critical UI/auth regressions; owner/reviewer approval captured. Only then change AB-WC-014 status to `Done` in the **active Engineering Work Control**. This document/patch alone does not finish acceptance.

## Boundary

UI checks do not replace API security tests, DB/RBAC validation or data privacy review. `AB-WC-014` is different from legacy imported `WC-014` (Docker Compose).


## Execution evidence — 2026-10-24

- Branch: `test/wc014-cross-role-qa`
- Viewports: 360x800, 768x1024, 1366x768
- Playwright Chromium: **24 passed, 3 intentionally skipped, 0 failed**
- Biome: **309 files checked, no fixes applied**
- TypeScript: **PASS**
- Vitest: **316 passed, 108 DB-dependent tests skipped**
- Next.js 16.4.1 production build: **PASS**
- `git diff --check`: **PASS**
- Supervisor mobile overflow: observed 406px document on 360px viewport; corrected responsive grid; regression passed on rerun
- Browser screenshots/report: retained locally in Playwright test artifacts; review and sanitize before sharing
- Automated coverage: cross-role landing, responsive page width, mobile navigation keyboard behavior, GIS table fallback, GIS HTTP 503 error/retry presentation
- Outstanding: manually verify scenarios WC014-07 through WC014-12 and any manual portions of WC014-01 through WC014-06; obtain reviewer approval
- Security: authenticated browser state in `e2e/.auth/` must remain local and untracked
- No WCAG conformance certification is claimed
