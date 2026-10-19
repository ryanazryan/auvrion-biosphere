# AB-WC-004 · Signed Better Auth Sessions and Route Handler DB Tests

**Status: candidate (not executed in owner workstation).** Additive WC-004 slice; it does not replace the first 17 PostgreSQL grant tests.

## Security boundary

- All database writes happen only on isolated `127.0.0.1:5434/auvrion_wc004_test`. The original `DATABASE_URL` must match `127.0.0.1:5433/auvrion_dev` / `auvrion_dev` user before the test changes the target to the independent test URL.
- `AUVRION-LOCAL` is created **inside the independent test database only**. If it already exists there, tests fail closed; never run against the development database or real accounts.
- Better Auth is the real configured instance: `auth.api.signInEmail({ asResponse: true })` issues **signed session cookies** and `auth.api.getSession` verifies them. Credentials are synthetic and ephemeral, created with `better-auth/crypto` `hashPassword`.
- `next/headers` is mocked only to simulate request-scoped cookie headers without spinning up an HTTP server; `@/server/db` is injected with a real Postgres Drizzle instance. **No auth session or authorization guard functions are mocked.**
- To test authorization behavior after a successful session, some synthetic tests explicitly insert MFA assurance records. This **does not prove a real TOTP challenge produced those records**. The local human TOTP flow of WC-003 is separate evidence.
- Tests directly invoke `GET /api/me` and `POST /api/admin/access-users/[id]/lifecycle` route-handler functions with `Request` objects. This is HTTP-handler-level testing, **not a real on-the-wire Next.js server / Playwright E2E test**.
- Test accounts use `wc004-http-*` IDs and synthetic `example.invalid` email addresses. Cleanup deletes only IDs created by this test run. No dev credential, actual session cookie, secret, TOTP seed or DB dump belongs in Git/logs.

## Run (Git Bash; project root)

```bash
npx biome check --write src/server/authorization/auth-session.http.db.test.ts
npm run lint
npm run typecheck

# Existing isolated Docker test database MUST be healthy and migrated.
docker compose --env-file .env.local -f compose.wc004.test.yml ps

RUN_AUTH_SESSION_DB_TESTS=YES npx vitest run \
  src/server/authorization/auth-session.http.db.test.ts

# Re-run old 17-test DB slice and ordinary checks.
RUN_AUTH_GRANTS_DB_TESTS=YES npx vitest run \
  src/server/authorization/auth-grants.db.test.ts
npm test
npm run build
git diff --check
```

Expected second-slice tests verify missing/forged cookie denial; signed login cookie and `/api/me`; MFA row absence/expiry; wrong or revoked role including new login; expired/deleted server session; operator denied admin lifecycle; admin denied without MFA; admin positive revoke deletes target session + MFA and writes an audit; forged cookie denied without mutation.

**Do not commit or mark WC-004 Done if any check fails.** Keep `.vscode/` untracked. Once ALL WC-004 security acceptance is checked and source reviewed, commit only explicit WC-004 paths and PR into `develop`.

## Remaining acceptance gaps

- Real TOTP challenge and recovery negative E2E; real HTTP/browser cookies over Next server (network). Follow-up release-gate tests can be a separate scope if WC-004's bounded DB-backed requirements are satisfied. Do not claim TOTP or production readiness from this suite.
- Observation, Ranger, evidence/file/export object-level guards need future domain implementation, so this task cannot claim end-to-end access isolation for modules that do not exist.
