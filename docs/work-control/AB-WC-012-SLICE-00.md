# AB-WC-012 — Slice 00: Workflow decision contract (candidate)

**Source:** Notion Business Rules & State Transitions / State Transition Register (AB-TR-010..033); all 24 Case/Task transitions are **Proposed**, not Approved.

## What this slice contains
- A server-workflow-directory candidate-edge registry for 14 Case and 10 Task transitions, using the existing literal names/IDs/actors. This is review metadata, not an authorization policy.
- `assessProposedTransition()` is intentionally **deny-only**. Its static policy-denial cannot be overturned by user input. No database changes, route handlers, UI actions, or persisted state mutation are included.
- Vitest verifies all proposed transitions deny, plus unknown-edge, wrong-actor, stale-version, and missing-reason safeguards.

## Blockers to resolve before Slice 01
1. Owner approval of allowed v1 Case/Task transitions in State Transition Register (especially GAP-06/07, escalation/rework/cancellation/closure).
2. Explicit cases for Monitoring/no task; whether any escalation to external authority is recorded and how; expected outcome semantics.
3. Transaction contract: organization/object scope, active role/MFA session, row lock/optimistic version, atomic case+task assignment, audit, retry/idempotency, and stale update conflicts.
4. Ranger identity and effective revocation. Server enforcement, not hidden buttons.
5. Figma Make Supervisor/Operator UI preview acceptance with no mock result represented as persisted action.

## Test in local repo (Git Bash)
`npx vitest run src/server/workflow/transition-contract.test.ts`
`npm run lint`
`npm run typecheck`
`npm test`
`npm run build`
`git diff --check`

**Expected status:** Slice 00 is **not** WC-012 Done and is **not** executable workflow. Work Control remains Blocked until legal-state decision; later code follows an approved policy.
