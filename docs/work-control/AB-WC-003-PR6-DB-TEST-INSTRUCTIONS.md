# AB-WC-003 PR 6 — PostgreSQL transaction integration testing

This adds ONE opt-in test file. It uses real local PostgreSQL tables, but **mocks checkAdminAccess**. It tests the real POST handler's DB transaction semantics, not a real user's cookie/MFA end-to-end.

## Safety

- Only runs if `RUN_LIFECYCLE_DB_TESTS=YES`.
- Refuses any DATABASE_URL other than `postgresql://auvrion_dev:***@127.0.0.1:5433/auvrion_dev` (postgres protocol also accepted).
- Changes `NODE_ENV`/`BETTER_AUTH_URL` only within the test process.
- Inserts synthetic `pr6-*` user rows with unique random IDs; uses the existing AUVRION-LOCAL organization.
- Deletes only fixture rows in `afterAll`. If the process is force-killed, orphaned fixtures may remain; do not manually delete rows without inspecting them.
- Do not run while performing live user-administration demos. Back up local dev data if needed.
- Real authentication/session-cookie denial still needs separate browser testing.

## Installation

Unzip from repository root to create:

`src/app/api/admin/access-users/[id]/lifecycle/route.db.test.ts`

## Commands (Git Bash)

```bash
npx biome check --write 'src/app/api/admin/access-users/[id]/lifecycle/route.db.test.ts'

# Explicit, one-time opt-in LOCAL DB-backed tests:
RUN_LIFECYCLE_DB_TESTS=YES npx vitest run 'src/app/api/admin/access-users/[id]/lifecycle/route.db.test.ts'

# After tests finish:
npm run typecheck && npm run lint && npm test && npm run build && git diff --check
```

Expected: 4 DB-backed tests pass, normal `npm test` skips these four tests. Tests are *not* executed against other DB environments.

## Acceptance caveats

- This verifies FK rollback, database session deletion + assurance cascade, audit consistency, and concurrent target mutations.
- It does not exercise real Better Auth HTTP cookies or admin MFA/capability verification, as the auth function is mocked.
- A concurrent stale admin edit may overwrite a newer edit; this test intentionally checks state consistency, NOT stale-update protection. Consider a version/expected-role precondition before calling security acceptance complete.
