# AB-WC-003 — Access Lifecycle (PR 5 candidate)

**Base:** `develop` after PR #22. **Branch:** `feat/ab-wc-003-access-lifecycle`.
**Status:** Source candidate; local build, DB migration and manual security acceptance NOT YET VERIFIED.

## Scope

- Admin-managed role grant/change/revoke for one explicit local development organization.
- Disable account (irreversible in this candidate) and invalidate all Better Auth sessions.
- Dedicated `manage_access` + MFA-protected admin UI and API.
- PostgreSQL audit row with actor, target, organization, old/new role and status, reason, and UTC timestamp in the same transaction.
- No public signup, no administrative-capability mutation, no automatic role assignment.
- `/` now checks account activation status before displaying the temporary development workspace.

## Security behavior

- Development-only route behind `ENABLE_LOCAL_ACCESS_REQUESTS=YES` and same-origin check.
- `checkAdminAccess(org, 'manage_access')` verifies account activation, capability and MFA assurance; all writes check it again server-side.
- Target user belongs to `AUVRION-LOCAL` only if a scoped historical role grant exists. Cross-org and unknown accounts fail closed.
- Self-change and any currently privileged administrator target are denied. This module is **not** the mechanism to manage admin capabilities.
- One active operational role per user/organization is the **local V1 policy** for this endpoint; pre-existing multiple active roles are blocked for manual review.
- `user_access` row lock serializes mutations; role updates, session deletion and audit insertion share one transaction.
- Revoke role does **not** change `user_access.active`; operational authorization must also check the active role grant. `checkOperationalAccess` currently fails closed pending MFA integration and must never be changed to allow merely on account status.
- Disable changes `user_access` to `disabled`, revokes role grants for local org and deletes sessions. No re-enable path exists here.
- Events are appended through the application API only; enforcing DB-level append-only privileges and independent review remain release tasks.
- No implicit retry on ambiguous failures; operator must reload and check audit before repeating.

## Installation

1. Ensure `git switch develop && git pull --ff-only origin develop` (do not discard changes).
2. Create or switch to `feat/ab-wc-003-access-lifecycle` from `develop`.
3. Extract ZIP with `unzip -n AB-WC-003-access-lifecycle-candidate.zip` (only new files + helper; README included).
4. Inspect `apply-existing.py`, then run `python apply-existing.py` once; it refuses unexpected existing-file anchors or wrong branch. It touches `drizzle.config.ts`, `src/components/admin/admin-shell.tsx` and `src/app/page.tsx`.
5. `npx biome check --write` for the candidate source and two integration files (see README).
6. Run `npm run lint && npm run typecheck && npm test && npm run build`.
7. `npx drizzle-kit generate` must create a **new** migration following `0009`; inspect SQL. Only new enum/table/index/foreign key expected. **Do not apply if destructive or unexpected.**
8. After approving SQL, `npx drizzle-kit migrate` targeting guarded LOCAL DB only.
9. `npm run dev`, then `/admin/access-users`, Mailpit and second InPrivate browser for acceptance.
10. Stage only scoped files including Drizzle migration+metadata. Never stage ZIP, `.vscode`, helper, `.env.local` or secrets.

## Manual acceptance checklist (PR 5)

- [ ] Manage-access admin with TOTP can see `/admin/access-users`.
- [ ] Reviewer-only admin **without** `manage_access` is denied.
- [ ] Unauthenticated client cannot list or mutate users.
- [ ] Set Ranger→Operator: prior grant revoked, new grant active, old sessions deleted, ONE audit event.
- [ ] Revoke Operator: no active role, old sessions deleted, ONE audit event, direct operational request denied.
- [ ] Grant role after revoke: returns effective role through a fresh MFA-approved session.
- [ ] Disable active Ranger: `user_access.disabled`; all target sessions deleted; role revoked; audit inserted; re-login or stale cookie cannot access protected content.
- [ ] Repeated disable, unchanged role, invalid role/reason, unknown user, cross-org ID, self-change and privileged target denied without mutation or audit.
- [ ] Multi-role corrupted fixtures fail closed; concurrency does not produce two active grants.
- [ ] Fresh session and admin capability remain required for actions; no privilege granted to applicant.
- [ ] Verify audit actor, reason, old/new role and status; no token/password/MFA secret in logs.
- [ ] Validate migration, unit tests, lint, typecheck, build; capture actual results (not assumed).

## Explicit out-of-scope items

- Production deployment and organization-scoped applications (the local queue has no organizationId).
- Managing admin capabilities, privileged-account disabling, enable/restore, cross-org transfers, and break-glass.
- Full DB-backed authorization E2E/security negative testing belongs in PR 6 final acceptance and AB-WC-004 as appropriate; PR 5 still needs direct manual checks.
- Object/zone/task-specific authorization, and opening any operational API prematurely.

This document is implementation handoff, NOT proof of passed acceptance or security review.
