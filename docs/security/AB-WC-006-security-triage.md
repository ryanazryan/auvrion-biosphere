# AB-WC-006 — Security & Dependency Triage

**Project:** Auvrion Biosphere  
**Work Control:** AB-WC-006 — Triage dependency, konfigurasi aman dan branch review gates  
**Owner / implementation branch:** `ryanazryan` / `chore/ab-wc-006-security-triage` (local branch reported by owner)  
**Reviewer:** Muhammad Satria Wiratama (`Renz100x`), scoped peer/evidence review  
**Date:** 17 October 2026  
**Document status:** Draft for Review — NOT YET DONE  
**Requirements:** AB-NFR-PLATFORM-003/008/009; TC-34/35

## 1. Scope & evidence boundaries

This report reconciles the user's local npm audit outputs, repository source read through the connected GitHub integration, and GitHub branch and CI metadata. It is not a penetration test, a production deployment review, a historical Git secret scan, an end-to-end security validation, or proof of compliance. The review was read-only; no repository files or settings were altered by this report's author.

Repository: https://github.com/ryanazryan/auvrion-biosphere  
Canonical task: https://app.notion.com/p/3fa73f8cd49981f4922de72a09467d9a

## 2. Verified baseline

| Item | Verified observation | Evidence / caveat |
|---|---|---|
| Local runtime | Node.js `v24.22.0`; npm `11.19.1` | Owner's Git Bash output |
| `develop` | Protected; HEAD `7942def8` | GitHub branch metadata; detailed approval settings not accessible to integration |
| `main` | Protected; HEAD `2b5c5f2` | GitHub branch metadata; detailed approval settings not accessible to integration |
| CI integration | PR #12 merged into `develop` | https://github.com/ryanazryan/auvrion-biosphere/pull/12 |
| CI workflow | PR triggers for `develop`/`main`, Node 24, `npm ci`, Biome, typecheck, Vitest, production build; read-only contents permission | `.github/workflows/ci.yml` on `develop` |
| CI execution | PR #12 head `d6c3a944` workflow run `38929358689` completed **success**; job `Lint, Typecheck, Test, Build` and each step reported success | GitHub Actions run metadata; this is PR #12 evidence, not execution of AB-WC-006-specific checks |
| Required branch status checks | No required checks shown for `develop` or `main` | Branch summary metadata; needs setup once check contexts are available |
| CODEOWNERS | No CODEOWNERS file found in enumerated `develop` tracked tree | Optional ownership hardening not implemented |

## 3. Dependency finding — DEP-001

**Advisory:** GHSA-67mh-4wv8-2f99 — esbuild development server issue.  
**Severity:** Moderate (per `npm audit`).  
**Local audit result:** `npm audit` and `npm audit --omit=dev` both reported four moderate dependency findings from one transitive advisory chain.  
**Observed chain:** `drizzle-kit@0.31.11` → `@esbuild-kit/esm-loader@2.6.5` → `@esbuild-kit/core-utils@3.3.2` → `esbuild@0.18.20`.  
**Additional nuance:** `drizzle-kit` is a root `devDependency`, but `better-auth@1.7.9` also declares `drizzle-kit` as a `peerOptional` relationship. The owner's `npm ls --omit=dev` still included this chain. Actual physical installation and exploitability in the final deployment image have NOT been verified.

**Owner decision (provisional):** Defer the dependency fix and additional verification for the competition prototype due to delivery constraints. Do NOT use `npm audit fix --force` (its suggested `drizzle-kit@0.18.1` entails a breaking change), do NOT suppress the finding, and do NOT represent the system as vulnerability-free. Keep the development server private; do not expose esbuild serve endpoints to untrusted networks. Review again before public production deployment, actual sensitive data, or external user onboarding, and sooner if exposure changes. This risk decision is time-limited and does not constitute verification that production is unaffected.

**Finding state:** Risk accepted provisionally for local/prototype development; remediation OPEN; production exposure UNKNOWN.

## 4. Source configuration review

| Item | Evidence-based finding | Remaining boundary |
|---|---|---|
| `.gitignore` | Ignores `.env`, `.env.*` except examples; ignores common private keys, notes, and build/test artifacts | Ignore rules do not prove credentials never entered Git history |
| `.env.example` | Contains local placeholders rather than usable secret values | Real local environment file was not opened (intentionally) |
| `compose.dev.yml` | Database port is bound to `127.0.0.1:5433:5432`, not all interfaces; credentials come from environment variables | Only development Compose configuration inspected; deployed infrastructure not verified |
| `drizzle.config.ts` | Migration configuration accepts only expected localhost development DB URL (`127.0.0.1:5433/auvrion_dev`) | Production migrations/deployment policy not verified |
| `src/server/auth/index.ts` | Requires `BETTER_AUTH_SECRET` length >=32 and configured `BETTER_AUTH_URL`; public signup disabled, auto sign-in disabled, email verification required | Full MFA/approved onboarding/recovery out of scope for this task; see AB-WC-001/002/003 |
| `src/server/db/index.ts` | DB URL is server-only; pool creation is lazy and errors if URL absent | Production TLS, network rules, least privilege and backup not verified |
| `src/app/api/health/database/route.ts` | Returns 404 when `NODE_ENV` is not `development`; error path returns generic 503 | Deployed runtime configuration not tested |
| `src/app/api/health/route.ts` | Returns only `{status:"ok"}` with `Cache-Control: no-store` | Public basic liveness only; no sensitive diagnostics observed |
| `src/server/authorization/operational-access.ts` and `admin-access.ts` | Deny-by-default with `MFA_ASSURANCE_REQUIRED` until verified MFA assurance exists | Not a working positive-path authorization lifecycle; do not bypass for demo |
| `src/app/api/me/route.ts` | Session-backed identity endpoint; unauthenticated 401; `Cache-Control: no-store` | Endpoint is not proof of operational authorization |

## 5. Secret scanning & residual limitations

The connected GitHub review enumerated the `develop` tracked tree and inspected 14 key files (configuration, server security modules, auth/API handlers, and README). A narrow set of obvious credential/private-key patterns was not matched in those inspected files. This does **not** constitute a complete tracked-content or Git-history secret scan. Files such as local `.env.local` were deliberately not accessed or shared.

**Required local follow-up — results pending:**

- Confirm `git ls-files` contains no unexpected `.env` or private key files.
- Confirm `git check-ignore` excludes `.env.local` and private notes.
- Run filename-only `git grep -l` matching common high-confidence secret patterns in tracked files.
- If anything sensitive appears, stop sharing output, rotate exposed credentials and remove them from current tracked content; historical exposure requires separate assessment.

## 6. GitHub governance follow-up

Both `develop` and `main` currently show `protected=true`. The integration cannot read the detailed minimum approvals/stale-review/admin bypass setting (403), so an owner screenshot or UI confirmation is required before claiming those controls as verified.

The workflow on `develop` has an actual successful `Lint, Typecheck, Test, Build` run. Consider enabling that specific required status check on `develop`, and on `main` after the workflow is integrated there and an applicable check exists. `CODEOWNERS` (e.g., `* @ryanazryan`) is not present; do not claim that every PR must be approved specifically by the Tech Lead until Code Owner reviews are enabled and verified. Repository owner bypass rights remain a governance exception if permitted.

## 7. Open findings and release limits

| ID | Status | Next action |
|---|---|---|
| DEP-001 | Deferred with provisional risk acceptance | Reassess esbuild/drizzle-kit and final production install/deployment; no automatic forced downgrade |
| GOV-001 | Open | Enable verified required CI check(s), after checking exact context and coverage of both branches |
| GOV-002 | Open | Add CODEOWNERS later and review admin-bypass policy; not a blocker for initial technical triage if exception documented |
| SEC-001 | Pending local evidence | Perform tracked filename/pattern check; do not declare full scan from source review alone |
| OPS-001 | Outside this task / pending deployment | Validate production secrets, DB access/TLS, backups, deployment and actual restore in AB-WC-020 |
| AUTH-001 | Outside this task / blocked by policy | Decide/implement MFA assurance and account lifecycle under AB-WC-001/002/003; retain fail-closed guards |

## 8. Definition of Done and sign-off

- [x] Review npm advisory chain and document impact limitations.
- [x] Record provisional, limited acceptance decision rather than silently dismissing Moderate finding.
- [x] Review representative server-side auth, DB, secret-handling and health configurations from repository.
- [x] Verify both target branches show protected=true.
- [x] Verify PR #12 CI quality job succeeded.
- [ ] Perform local tracked filename/pattern scan and record outcome.
- [ ] Confirm rule detail (minimum approval, stale dismissal, force push/deletion restrictions) in GitHub UI.
- [ ] Decide required CI status check policy and record enabled/deferred state.
- [ ] Push this report or equivalent evidence in a task-scoped PR to `develop`.
- [ ] Obtain bounded review by `Renz100x` and owner technical sign-off; attach PR/evidence to Notion Work Control.

**Current disposition:** Draft for Review, NOT Done. No production-security sign-off is implied.
