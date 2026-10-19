# AB-WC-007 Slice 04 — minimum report lineage, not reporting API

**Status:** candidate implementation for isolated test, NOT deployed / NOT owner-reviewed at physical field/policy level. Date 19 Oct 2026. Supports logical ReportVersion/ReportInput minimum in AB-DOC-ANL-009. P0 CSV/ESG PDF production pipelines, legal publication workflow, deletion and dashboard reporting are NOT delivered by this package.

## Package contents

- `src/server/db/report-domain-schema.ts`: 2 additive tables (`report_versions`, `report_inputs`). Report source references are organization-scoped composite FKs, for observation/case/task only.
- `src/server/db/report-domain.db.test.ts`: 7 opt-in database integrity tests (rollback fixtures).
- `scripts/wc007-add-slice04-schema.mjs`: opt-in registration in **three** Drizzle configs, idempotent and refuses wrong schemas.
- `scripts/wc007-migrate-slice04-isolated.mjs`: only target 127.0.0.1:5435 / `auvrion_wc007_test`, expects 13 migrations + 32 tables or already applied 14 + 34.

## Procedure (Git Bash, in existing feature branch)

1. Extract zip **into project root**, do not overwrite or delete existing files. Check `git status -sb`.
2. `node scripts/wc007-add-slice04-schema.mjs`
3. `npx biome check --write src/server/db/report-domain-schema.ts src/server/db/report-domain.db.test.ts scripts/wc007-add-slice04-schema.mjs scripts/wc007-migrate-slice04-isolated.mjs drizzle.config.ts drizzle.wc004.config.ts drizzle.wc007.config.ts`
4. `npm run lint && npm run typecheck`
5. `npx drizzle-kit generate --config=drizzle.config.ts --name=wc007_report_lineage` — expected `0013_wc007_report_lineage.sql`, 34 total tables.
6. **STOP before migration:** inspect SQL for `CREATE TABLE "report_versions"`, `CREATE TABLE "report_inputs"`, no DROP/ALTER existing tables, and composite FK targets. Composite target `report_versions(id, organization_id)` is declared a *table UNIQUE* so it exists before FK registration. If generated SQL differs, ask for review.
7. After confirming safe SQL, use `node scripts/wc007-migrate-slice04-isolated.mjs` (only test database, never production).
8. Only after the above reports 14/14 and 34 tables: `RUN_WC007_DB_TESTS=YES npx vitest run src/server/db/report-domain.db.test.ts src/server/db/observation-domain.db.test.ts src/server/db/operations-domain.db.test.ts`.
9. `npm run lint && npm run typecheck && npm test && npm run build && git diff --check`.
10. Selectively stage WC-007 source/test, configs, migrations & snapshots, docs and scripts; **DO NOT stage** `.vscode/`, `.env.local`, secrets, generated credentials. Human code review and explicit unresolved policy management still required before releasing.

## Limitations / open safeguards

- No end-user report API, PDF, automatic ESG claim, automated publisher or any granting of permissions. A report may have `counts = NULL` to distinguish unknown/no-data from measured zero.
- Daily bucket `Asia/Makassar`, UTC timestamps. Scope hash is required; service must generate correct deterministic digest from normalized filter; hash by itself is not authorization.
- Publication uniqueness is a database guard, **not** a publication state machine. Service must enforce reviewed event transitions, append-only revision/input membership, no post-publication mutation, approved scope and audit.
- `input_snapshot` is a JSON object and must be redacted/filtered for role-visible reporting; database guards constrain same-organization targets but do not check row-level role grants or scientific validity.
- Explicit classification, legal basis, privacy precision, deletion/retention/backups, final state transitions and report cutoff rules remain pending governance approval. Do not claim WC-007 policy release-ready because schema tests pass.
- This file does not modify historical 0000–0012 migrations and does not authorize writing to 5433/5434, shared or production databases.
