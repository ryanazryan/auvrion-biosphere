# AB-WC-004 — Isolated PostgreSQL authorization tests (candidate)

**Status:** Test candidate, not executed on the owner workstation. Never treat as a passed test before running it locally.

## Safety boundary

- Existing `compose.dev.yml` continues on `127.0.0.1:5433/auvrion_dev` and is not modified.
- WC-004 uses a **different Docker Compose project**, independent volume and `127.0.0.1:5434/auvrion_wc004_test`.
- Both test configuration and tests validate the original URL is the known local dev URL before transforming it to the separate test port/database. Never run with real production secrets.
- Test fixtures use `wc004-*` synthetic identities and generated organization IDs; no acceptance account is used.
- Test's `getCurrentSession` adapter reads real PostgreSQL session and user records. This is **not** a Better Auth browser/cookie E2E test; verify authentic HTTP session later.
- Run migrations only with `--config=drizzle.wc004.config.ts`. NEVER run the ordinary `drizzle.config.ts` migration to set up tests.

## Run in Git Bash from the project root

```bash
# Inspect added files and ensure no unexpected staged work.
git status -sb

# Start only the independent test Postgres (existing dev database is untouched).
docker compose --env-file .env.local -f compose.wc004.test.yml up -d db
docker compose --env-file .env.local -f compose.wc004.test.yml ps

# Initialize ONLY the separate test database from committed SQL migrations.
npx drizzle-kit migrate --config=drizzle.wc004.config.ts

# Candidate tests run only with this opt-in variable.
RUN_AUTH_GRANTS_DB_TESTS=YES npx vitest run src/server/authorization/auth-grants.db.test.ts

# Project-wide quality gates (the DB suite is skipped by ordinary npm test).
npx biome check --write src/server/authorization/auth-grants.db.test.ts drizzle.wc004.config.ts
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

The new tests must PASS before the test suite can be claimed complete. Do not commit while any test fails. The PostgreSQL DB/volume is isolated from development; `docker compose --env-file .env.local -f compose.wc004.test.yml down` stops it **without deleting its volume**. `down -v` would delete only the WC-004 test volume, but is unnecessary at this stage.

## Coverage in this first slice

Real PostgreSQL queries for active / pending / disabled, verified email and approved application, organization-scoped operational grants, revoked/wrong/no role, administrator capability separation, valid/missing/expired MFA assurance, and deleted-session cascade. The test's request-session adapter is DB-backed but **does not** prove Better Auth session-cookie verification or actual HTTP API forbidden responses. Further WC-004 work must cover these separately, and later observation / ranger / media routes cannot be tested before they exist.
