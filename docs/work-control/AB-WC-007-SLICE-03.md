# AB-WC-007 — Slice 03: PostGIS Zone, Ranger assignment, Evidence

**Status:** candidate code patch; **not migrated or tested**. Apply on `feat/ab-wc-007-domain-data-model`. No auth route or access-policy change. Existing 0011 migration and 10 tests must remain intact.

## Scope

Adds 8 tables: `operational_zones`, `zone_geometry_versions` (immutable historical versions by convention), `observation_zone_matches`, `domain_tasks` (state left out until policy review), `task_assignments` (single active assignment/task), `task_findings`, `evidence_media` (private opaque key), `evidence_links` (observation XOR finding). Foreign keys that join tenant-scoped entities use `(id, organization_id)` where applicable. `geometry(MultiPolygon,4326)` with GiST spatial index, ST_IsValid check, revisions retained.

Not implemented: authz services checking active role/assurance, actual media upload validation/storage ACL, automatic spatial intersection job, transaction/audit service, clinical/scientific ground truth, change-proof immutable triggers, retention/deletion and full workflow transitions (GAP-04/06/07/10/11). DB constraints do not replace server authorization.

## Sequence: apply patch and generate migration

1. Confirm branch and clean relevant paths with `git status -sb`. Preserve `.vscode` as unrelated/untracked, **do not git add -A**.
2. Extract this ZIP to repository root, keeping `src/server/db/operations-domain-schema.ts`, `src/server/db/operations-domain.db.test.ts`, `scripts/wc007-add-slice03-schema.mjs` and this document. It doesn't replace existing schema or migrations.
3. Run `node scripts/wc007-add-slice03-schema.mjs` to add the new schema to **three** existing configurations. It is idempotent and never connects to a DB.
4. Run `npx biome check --write src/server/db/operations-domain-schema.ts src/server/db/operations-domain.db.test.ts drizzle.config.ts drizzle.wc004.config.ts drizzle.wc007.config.ts`; `npm run lint`; `npm run typecheck`; `git diff --check`. Fix/stop if any error.
5. **Verify PostGIS in WC-007 test only:**

```bash
# Optional psql check from container; expect one nonempty result:
docker compose --env-file .env.local -f compose.wc007.test.yml exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT PostGIS_Version();"'
```

If extension is not installed, **stop** for a reviewed custom extension migration. Do not `drizzle-kit push` or install extensions in prod.

6. Generate using local **development guard** config (this does not apply to DB):

```bash
npx drizzle-kit generate --config=drizzle.config.ts --name=wc007_operations_domain
```

Expect **`drizzle/0012_wc007_operations_domain.sql`** with 8 new tables. If filename differs, stop and inspect instead of editing arbitrary files.

7. Validate and inspect the generated migration:

```bash
python scripts/wc007-reorder-composite-fk-indexes.py
cat drizzle/0012_wc007_operations_domain.sql
```

Unlike migration 0011 (which required index reordering), new parent tables use inline `UNIQUE` constraints to avoid the composite-FK ordering pitfall. **Check manually before running.** No automatic rewrite or schema regenerate after manual SQL edits.

8. Once reviewed, apply the **incremental** migration to isolated WC-007 DB only:

```bash
node scripts/wc007-migrate-slice03-isolated.mjs
```

The old `wc007-migrate-isolated.mjs` from Slice 02 requires **exactly 12 migrations and an empty DB**. NEVER use it after 0011 is applied. The incremental helper refuses non-test DB addresses, requires exactly 12 prior rows / 24 prior tables / PostGIS, and confirms 13 rows / 32 tables after 0012. It does not run `push`, reset/drop volumes or touch dev. If any precondition fails, stop and request review rather than resetting the DB.

9. After migration 0012 shows as applied and all 8 tables exist, run:

```bash
RUN_WC007_DB_TESTS=YES npx vitest run src/server/db/observation-domain.db.test.ts src/server/db/operations-domain.db.test.ts
```

Expected **10 original + 8 new** tests PASS. Run `npm test`, `npm run build` after integration tests. No `git add -A`, deployment, or PR yet.

## Guardrails

- PostGIS extension is assumed in test container; generic VPS Postgres requires extension installation procedure.
- Classification/precision `restricted_pending_policy` are placeholders. Never interpret as permission to display raw data.
- Ranger assignment rule is DB-level uniqueness only. API must verify active role grant, organization, MFA if required, version/state and actor scope.
- Available media metadata check is **not** evidence that object bytes actually exist and were scanned. Service layer must validate object ACL/bytes/hash first.
- Geometry revisions must be append-only at service/DB-policy layer before release. Schema alone does not prevent UPDATE/DELETE of version rows.
- Respect 0011 previously hand-reordered SQL and Drizzle journal; do not regenerate 0011.
