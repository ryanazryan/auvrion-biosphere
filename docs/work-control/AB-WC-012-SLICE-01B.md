# AB-WC-012 — Slice 01B: Transactional Case Workflow (candidate)

**Source:** canonical Notion State Transition Register. Owner approves only AB-TR-010..013. AB-TR-014..033 remain Proposed. This is backend-only and has **not** been locally tested on the owner's machine.

## Added files

- `src/server/workflow/approved-case-policy.ts` — only 4 approved Case edges, strict input parsing; no client-provided actor/role.
- `src/server/workflow/approved-case-policy.test.ts` — parser and fail-closed edge unit tests.
- `src/server/workflow/case-transition-service.ts` — transactional server service; no HTTP endpoint or frontend wiring.

## Invocation model (NOT a public route)

Server code may call `transitionApprovedCase(raw)` after receiving a bounded and authenticated request. The service itself calls `checkOperationalAccess` (signed session, approved active account, current MFA assurance, live operational role) and selects required role from the canonical edge, never from client input.

Command fields:
- `organizationId`, `caseId`, `requestId` (UUID strings)
- `transitionId` (only AB-TR-010..013)
- `expectedVersion` positive safe integer
- `reason` nonempty (10..2000 trimmed chars)
- For AB-TR-013 only, `assignment`: `rangerUserId` (Better Auth user ID), `zoneId` (organization-scoped operational zone UUID), `title`, `instructions`, `safetyNotes`.

## Transaction invariants

1. Lock active actor access/grant and the Case row; reject inactive role/organization and stale status/version.
2. Reject Case without linked active observation. This slice **does not create Cases**. Bootstrapping is a separate policy/design item.
3. Same `(caseId,requestId)` replays only if actor/edge/version/reason/assignment match; no duplicate side effects.
4. For AB-TR-013, lock/validate Ranger active user, approved access and organization-scoped Ranger grant; require a real organization zone as the location *reference*, not incident coordinates.
5. Create Task, active assignment, increment Case version, and create audit event within **one database transaction**; rollback on any failure.
6. Unknown/proposed AB-TR IDs and all Task status mutations remain disabled.

## Important limitations / release gates

- **No API endpoint / UI integration yet** (Slice 01C). Operator and Supervisor cannot use this from browsers yet.
- **No Case intake and observation-to-case linkage creation**. Case must already exist with valid linked observation. Needs separately reviewed intake flow.
- **No immutable audit trigger / DB append-only permissions** in migration 0015. The service only inserts events; DBA-level protection is pending.
- `domain_tasks` has no persisted `zone_id`; the validated zone code/name are placed in task instructions for this V1 candidate. Before release, review adding durable zone FK/version snapshot; free-form text must not be treated as reliable geospatial assignment authority.
- No location precision change. Device coordinates are not an incident point; no exact-coordinate disclosure is authorized here.
- No real DB/service integration tests in this slice's delivered tests; run opt-in tests and add transactional HTTP/DB tests **before merge**.
- A `success` from the parser alone is **not an authorization grant**; never bypass `transitionApprovedCase`.

## Owner-local test commands

```
npx biome format --write src/server/workflow/approved-case-policy.ts src/server/workflow/approved-case-policy.test.ts src/server/workflow/case-transition-service.ts
npm run lint
npm run typecheck
npx vitest run src/server/workflow/approved-case-policy.test.ts src/server/workflow/transition-contract.test.ts
npm test
npm run build
git diff --check
git status -sb
```

**Do not commit or push until checks pass.** Note: the existing Slice00 `assessProposedTransition()` remains deny-only by design (legacy planning tests); the service uses the dedicated approved-edge registry and server auth.

## WC-015 / WC-016 follow-up

Both physical node validations depend on AB-WC-017 (device identity, revoke, idempotent durable ACK). Order: WC-012 service/route/test, WC-017 protocol/identity and ingestion test, then physical LISTEN and PREVENT wiring/firmware validation with actual components, 5 V/3.3 V pinout verification, offline/replay tests. Do not claim physical assembly until hardware and evidence exist.
