# AB-WC-007 — Slice 02: isolate, migrate, test (candidate)

**Status:** Patch prepared for owner workstation. The contributor has not run Docker/PostgreSQL here. No development, production or existing WC004 database is altered by this package.

## What this adds

- `compose.wc007.test.yml` — independent PostGIS PostgreSQL container, database `auvrion_wc007_test` at `127.0.0.1:5435` and separate named volume.
- `drizzle.wc007.config.ts` — permits migration **only** to 127.0.0.1:5435 `auvrion_wc007_test` derived from the known dev URL identity. Does not edit `drizzle.config.ts`.
- `src/server/db/observation-domain.db.test.ts` — 10 guarded Vitest integrity checks: provenance, measurement, cross-org FK, dedup, coordinate/unknown reason, Case link uniqueness, unlink history. All fixtures inside one `BEGIN` / `ROLLBACK` transaction. **Does not test route/API RBAC, spatial PostGIS geometry, Ranger, media, workflow, or AI.**
- `scripts/wc007-migration-audit.py` — validates exactly seven new tables and fixes **only** three spelling/whitespace defects if they exist in generated SQL: `IS NOTNULL`, `restrictON UPDATE`, `USINGbtree`. It never connects to a database. Check diff after applying fix.

## 0. Starting point — Windows Git Bash in repository root

```bash
git branch --show-current
git status -sb
```

Expected branch: `feat/ab-wc-007-domain-data-model`. Ensure the first ZIP's `drizzle/0011_wc007_domain_foundation.sql` and snapshot already exist. This ZIP **does not replace** any previously created SQL migration/snapshot or existing Drizzle configs.

Extract ZIP into repository root without deleting existing files.

## 1. Inspect SQL before any migration

```bash
python scripts/wc007-migration-audit.py --fix
python scripts/wc007-migration-audit.py
git diff -- drizzle/0011_wc007_domain_foundation.sql
```

If any SQL was corrected, explicitly inspect `CREATE TABLE`, indexes and FKs. The four enums and seven tables must be additive. No destructive SQL is permitted. A Drizzle snapshot is logical metadata; correcting invalid whitespace in SQL does **not** change schema meaning. Do not regenerate `0011` after fixing or the token defects might reappear.

## 2. Start isolated database — NOT dev :5433 / WC004 :5434

```bash
docker compose --env-file .env.local -f compose.wc007.test.yml up -d db
docker compose --env-file .env.local -f compose.wc007.test.yml ps
```

Check `healthy` (it can take several seconds). Only after the migration audit passes:

```bash
npx drizzle-kit migrate --config=drizzle.wc007.config.ts
```

**Never use** `--config=drizzle.config.ts` for this validation run. If the command fails, **stop** and share the exact error. Do not run `push`, retry with alternate DB URL, or delete volumes automatically.

## 3. Opt-in real PostgreSQL tests

```bash
RUN_WC007_DB_TESTS=YES npx vitest run src/server/db/observation-domain.db.test.ts
```

Expected: **10 tests**, with all passing only if migration and constraints work. Tests do not persist fixtures; `ROLLBACK` prevents synthetic rows remaining in the database.

## 4. Standard quality gates

```bash
npx biome check --write drizzle.wc007.config.ts src/server/db/observation-domain.db.test.ts
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
git status -sb
```

Ordinary `npm test` skips WC007 opt-in DB tests unless the environment variable is set. This is intentional. Leave `.vscode/` untracked and uncommitted.

## 5. What to report

Share full output of (1) migration audit, (2) `drizzle-kit migrate` with wc007 config, (3) WC007 opt-in Vitest test, (4) lint/typecheck/build (or the first error). **Do not commit/merge yet.** Further WC007 slices still need PostGIS zones, task assignment, evidence, reporting and real policy-bound integration tests; the current acceptance proves only Slice 01 SQL constraints.

To stop **only** WC007 test database without deleting its storage:

```bash
docker compose --env-file .env.local -f compose.wc007.test.yml down
```

Avoid `down -v` unless explicitly deciding to delete the separate test volume.
