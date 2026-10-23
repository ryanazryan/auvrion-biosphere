# AB-WC-013 Slice 00 — Ranger Assigned-only Read Boundary

**Status:** Candidate — owner must apply and verify. No actual DB/HTTP tests have yet been executed in the target repository.

## Purpose

Introduce two read-only endpoints based on the **existing** domain_tasks and task_assignments tables:

- GET `/api/ranger/tasks?organizationId=<uuid>&limit=<1..50>`
- GET `/api/ranger/tasks/<taskId>?organizationId=<uuid>`

Both require a signed/active account, an active organization-scoped **ranger** role and current-session MFA via checkOperationalAccess. `rangerUserId` comes solely from server-side authentication. Service queries recheck active grant, userAccess and effective unrevoked assignment. The same-org foreign keys already exist. Only list/detail task metadata and safety context are returned. No precise coordinates, evidence blobs, other ranger IDs, public URLs or edit endpoints.

## Policy gate

Notion State Transition Register AB-TR-024..033 are **Proposed**, NOT Approved. This slice deliberately implements **no Task state mutations**, no transition permissions, no close/completion, no Ranger evidence upload, no outcome claim. Later slices require explicit owner-approved transition IDs and safety/evidence rules; do not silently infer approval from presence of an enum or Figma mock.

## Verification

1. Apply add-only files; check git branch first.
2. Run Biome, npm run lint, npm run typecheck, focused Vitest tests, npm run build.
3. Add isolated real-PostgreSQL tests proving denied guessed ID/cross-assignment, revoked ranger grant/assignment and no location disclosure. Existing tests in this candidate cover only input parser and HTTP guards; **do not label this service verified until DB tests pass**.
4. Real Ranger login/current-session MFA and responsive browser acceptance needed before WC-013 Done.

## Follow-on slices

- Slice 01: DB integration tests and scoped task history read.
- Slice 02: owner decision on AB-TR-024..033, DB state transition ledger and guarded Ranger actions; no transition before decision.
- Slice 03: typed finding append, privacy-reviewed evidence references, Supervisor outcome/history after approval.
- Slice 04: Next.js mobile-first Ranger UI and true logged-in acceptance.
