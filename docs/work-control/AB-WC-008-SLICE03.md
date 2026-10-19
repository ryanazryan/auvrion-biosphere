# AB-WC-008 — Slice 03: Signed session / Route Handler DB integration

**Status: candidate patch, NOT TESTED ON OWNER MACHINE.**

## Scope

- Real Better Auth signed password-login cookies; actual account gating,
  operational role-grant and server-stored MFA-assurance queries.
- Real `POST /api/observations`, `GET /api/observations`, and
  `GET /api/observations/[id]` **Route Handler functions**, actual service and
  PostgreSQL/PostGIS schema, tested on isolated WC-007 database.
- Valid operator write/read; supervisor read-only; Ranger broad access denied;
  admin capability not an operational role; cross-organization selectors and
  foreign object 404; 409 idempotency conflict; account disable/revocation;
  cache policy; no exact coordinate disclosure.
- Synthetic fixtures cleaned by ID in afterAll; no database schema changes.

## Strict boundaries

- Test runner requires `RUN_WC008_HTTP_DB_TESTS=YES`; no opt-in means skipped.
- Config accepts only local `.env.local` dev URL
  `127.0.0.1:5433/auvrion_dev`, remapping to
  `127.0.0.1:5435/auvrion_wc007_test` with matching `auvrion_dev` user.
- DB identity verified before inserts; do not run parallel opt-in HTTP suites
  against the same DB. Do not change this test's DB URL to dev/prod.
- MFA assurance is inserted as a synthetic *server-side test fixture*. This
  exercises the real access guard, but **does not test the real TOTP verification
  ceremony**; WC-002 separately owns that.
- Test calls Next.js Route Handler functions with a request-scoped `headers()`
  adapter. **Not a real network HTTP test**, and not a production security
  approval. No claims about deploy, browser CORS/CSRF, or infrastructure.
- Cleanup runs for generated fixture IDs only. If beforeAll fails, inspect the
  isolated test DB rather than running destructive reset or `down -v`.

## Installation / validation (Git Bash, repository root)

```bash
# Expected active branch: test/ab-wc-008-http-auth-integration
test -f src/app/api/observations/observation-auth.http.db.test.ts
npx biome check --write src/app/api/observations/observation-auth.http.db.test.ts
npm run lint && npm run typecheck && npm test
# Confirm WC-007 isolated container is healthy
docker compose --env-file .env.local -f compose.wc007.test.yml ps
RUN_WC008_HTTP_DB_TESTS=YES npx vitest run src/app/api/observations/observation-auth.http.db.test.ts
npm run build
git status -sb
```

## Evidence needed before PR / closure

Record actual `PASS` / `FAIL` / `SKIPPED` counts, sanitized error output,
branch + SHA, DB identity, CI result, real HTTP smoke limitations, and review
outcome. Keep AB-WC-008 `In Progress` until verified. API contract should be
reviewed with AB-WC-009 UI owner before calling it frozen.
