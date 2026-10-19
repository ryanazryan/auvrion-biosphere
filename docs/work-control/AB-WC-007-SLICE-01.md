# AB-WC-007 — Slice 01: additive domain schema candidate

Status: **UNVERIFIED PATCH**. Source baseline GitHub `develop` inspected 19 Oct 2026. This does **not** mark WC-007 Done and contains **no generated migration**.

## Included
- `src/server/db/observation-domain-schema.ts`: source, observation, provenance, environmental measurement, ecosystem profiles, cases, auditable observation-case links (7 tables) and enums/constraints.
- `drizzle.config.ts`, `drizzle.wc004.config.ts`: append schema entry, preserving all existing schemas and strict URL guards.

## Important limits
- Scope is 007-B foundation **only**. No API, RBAC service, report, media, zone geometry, Ranger assignment, lifecycle transitions, scientific confirmation, retention deletion, or automated AI authority in this patch.
- JSON input example and linked case history are not an authorization mechanism; write endpoints MUST enforce effective grants and transactions.
- `observationProvenance` uniqueness ensures at most 1 provenance per observation; accepted observations require a transactional insert that writes **both** observation and provenance (DB alone cannot enforce exact one from observation to child row).
- `source_record_id` is nullable; nullable values are not a dedup guarantee. Existing provider duplicate policy requires code validation.
- SQL expressions in `pgTable` extras require **Drizzle Kit local validation**; composite FKs should be compared to actual generated DDL. Do not deploy until this passes.  
- Measurement scalar is generic; unit allowlists, ecosystem zone and sensitive coordinate precision still need approved contracts. `latitude/longitude` are nullable decimal degrees (not PostGIS geometry). Real PostGIS zone geometry is reserved for next slice after review.

## Safe application procedure (Windows Git Bash)
1. Verify `git status -sb` (no conflicting local changes) and `git branch --show-current` (your WC-007 branch).
2. Extract ZIP in repository root **without deleting files**. ZIP contains new schema/docs plus replacement config files; review `git diff` after extracting.
3. `npm ci` if needed. `npm run lint && npm run typecheck && npm test && npm run build`.
4. **Generate only:** `npx drizzle-kit generate --config=drizzle.config.ts --name=wc007_domain_foundation` (this generates SQL locally, it does not apply migration).
5. Inspect generated SQL carefully. Verify existing auth/grants tables are not dropped or rewritten, check real FK constraints, numeric and timestamp types; require fresh PostGIS isolated DB for testing before any migrate command.
6. Do not run `push`, `migrate` or any SQL against production; share output/errors with assistant for review.

## Before implementation Done
WC-007 continues with zone geometry / privacy, evidence classification, Ranger task/assignment constraints, reliability/reporting, isolated migration test, authz negative tests, and independent security review. Open policy decisions require explicit approval.
