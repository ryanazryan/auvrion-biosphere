# AB-WC-012 Slice 01C — guarded Case transition HTTP boundary

Candidate code patch. Must be tested on project owner's branch; no production claim.

## Endpoint

`POST /api/cases/:caseId/transitions?organizationId=<uuid>`

Headers: `Content-Type: application/json`, `Origin: <BETTER_AUTH_URL origin>`, `Idempotency-Key: <uuid>`.

JSON: `{ "transitionId": "AB-TR-010", "expectedVersion": 1, "reason": "Human verified case rationale" }`.

For AB-TR-013 only, add `assignment: { rangerUserId, zoneId, title, instructions, safetyNotes }`.

The service, not the browser, resolves the actor from the canonical owner-approved transition, checks signed session/account+MFA+tenant live grant, locks Case, enforces version/idempotency, and commits Case+Task+Assignment+ledger atomically. No other transition is authorized. This is a *mutating endpoint*, not a case intake, list/read endpoint, Ranger workspace, or production UI.

## HTTP controls

- Case path and organization query UUID validation; duplicate query rejected.
- Request ID read from UUID `Idempotency-Key` only; client role and scope fields rejected.
- Fail-closed same-origin POST policy against `BETTER_AUTH_URL`, with cross-site request rejection.
- JSON-only, no compressed content, 8 KiB actual stream cap, optional declared Content-Length validation.
- Both scope and authorization are revalidated by `transitionApprovedCase` on current server session; client cannot grant permissions.
- No-store/private responses, no coordinate disclosure, no raw exception messages.

## Required verification and remaining blockers

1. `npm run lint && npm run typecheck`
2. `npx vitest run src/app/api/cases/'[id]'/transitions/route.test.ts`
3. `RUN_WC007_DB_TESTS=YES npx vitest run src/server/workflow/`
4. `npm run build && git diff --check`
5. Manual signed browser HTTP tests Operator and Supervisor with correct MFA session; do not fake production authorization.
6. Audit Append-only DB protections, Case intake/link creation, scoped Case listing/details, UI integration, and real browser acceptance before WC-012 marked Done.

The current transition-contract.ts planning guard continues to deny all 24 historical entries. It is not part of this live route and must be reconciled before claiming consistent canonical policy across the codebase.
