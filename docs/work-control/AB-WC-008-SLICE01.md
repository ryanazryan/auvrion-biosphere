# AB-WC-008 — Slice 01: Manual Observation API candidate

**Status:** implementation candidate, awaiting local lint/typecheck/unit test/build and isolated DB integration validation. No production migration/deployment is authorized by this patch.

## Purpose

- Build Next.js Route Handler endpoints using existing Better Auth / account access / operational-role + current MFA assurance.
- `POST /api/observations`: create a manual observation and provenance atomically. Only `operator` role, authorized for the selected organization.
- `GET /api/observations?organizationId=...`: scoped, filtered and paginated observation list. Allows `operator` or `supervisor` scoped grant + session assurance.
- `GET /api/observations/{id}?organizationId=...`: scoped detail and measurements; returns 404 when the observation does not exist within the selected organization.
- Existing `ranger` role is deliberately NOT granted broad observation reads; assigned-only access belongs to AB-WC-013.
- Organization supplied in request is a **selector** checked by server-side role grant; never trusts it as authority.

## Manual intake contract

Example (UUIDs below are placeholders, replace with real authorized organization ID and its active `kind=manual` source ID):

```json
{
  "organizationId": "00000000-0000-4000-8000-000000000001",
  "sourceId": "00000000-0000-4000-8000-000000000002",
  "sourceRecordId": "manual-20261019-unique-001",
  "domain": "environmental_risk",
  "ingestionMode": "historical",
  "observedAt": "2026-10-19T09:30:00+08:00",
  "locationUnknownReason": "not-collected",
  "provenance": { "attribution": "manual operator entry", "limitations": ["No instrument calibration evidence"] },
  "measurements": [{ "kind": "temperature", "measuredValue": "30.50", "unit": "celsius" }]
}
```

- The only supported source kind for POST is an existing **active manual source** in the same organization. This endpoint is not a device ingestion endpoint.
- `domain` is `biodiversity` or `environmental_risk`; `ingestionMode` is required (`live`, `historical`, or `simulation`). Simulation MUST be labeled as simulation in the calling workflow; never present simulated observations as verified real-world field data.
- `sourceRecordId` is required (1..128 safe characters) and must remain unchanged for retries of the same logical action. Client should generate it once, e.g. a UUID. A repeated identical canonical payload returns **200** `{id, replayed: true}`; newly created returns **201** `{id, replayed: false}`; same idempotency identity and differing payload returns **409**.
- Supply `observedAt` in RFC3339 with an explicit timezone (e.g. `+08:00` or `Z`), OR `unknownObservedTimeReason` if unknown. Do not supply both.
- Supply both numeric `latitude` and `longitude` in valid ranges, OR `locationUnknownReason`. Do not supply both; missing precise locations must not be fabricated.
- No upload, recording, or device endpoint included. `biodiversity` manual observations have no measurement entries for this slice; `environmental_risk` may have bounded numeric measurements.
- All new records initially have server-controlled `quality=unreviewed`.
- The hash in `observation_provenance.payload_sha256` is the normalized request fingerprint to detect conflicting retries, **not** a raw-audio checksum, data quality assurance, or forensic authenticity proof.

## Safe read contract

- GET returns only `operator`/`supervisor` scoped data; list filters include `domain`, `sourceId`, `quality`, `receivedFrom`, `receivedTo`, `limit`, `offset`.
- `limit` 1..50; `offset` 0..10000. Response includes scoped `total` (not cross-organization totals).
- Precise coordinates are deliberately **redacted** from API responses pending sensitive location precision/privacy decision (GAP-11); response includes only `location.hasCoordinates` and `location.unknownReason`.
- API results are `Cache-Control: no-store`. `licenseNote` is persisted but not yet published in output pending policy review.
- Route-level authorization validates active approved account, role grant and current-session MFA. Service-level DB lookups apply organization scopes for reads; composite FK enforces org-matched source on write.

## Verification (run in owner's Windows Git Bash project)

```bash
npx biome check --write src/server/observations src/app/api/observations
npm run lint
npm run typecheck
npx vitest run src/server/observations/observation-input.test.ts src/app/api/observations/route.test.ts 'src/app/api/observations/[id]/route.test.ts'
npm test
npm run build
git diff --check
```

**Not yet completed:** actual HTTP testing with a session and a seeded manual source in an isolated DB, concurrent retry/collision and rollback integration tests, full cross-org DB/API tests, human/security review, WC-007 policy GAPs and production migration plan. Do not set AB-WC-008 or related FR/NFR to Verified until evidenced.

**Database warning:** the WC-007 schema was applied successfully to the isolated `auvrion_wc007_test` on localhost:5435. This patch does NOT migrate your development DB on 5433 or production DB. Do not point live traffic or smoke tests to a non-migrated DB.

## Verification Evidence — 19 October 2026

Branch: feat/ab-wc-008-observation-intake-query

Environment:
- Windows / Git Bash
- PostgreSQL/PostGIS isolated database
- 127.0.0.1:5435 / auvrion_wc007_test

Results:
- Biome lint: PASS (147 files)
- TypeScript typecheck: PASS
- Unit tests: 87 passed, 63 skipped
- WC-007 domain DB tests: 10 passed
- WC-008 observation service DB tests: 8 passed
- Next.js production build: PASS

Verified:
- Manual observation persistence
- Observation provenance transaction
- Environmental measurement persistence
- Idempotent replay and conflict handling
- Cross-organization source rejection
- Inactive/nonmanual source rejection
- Transaction rollback
- Scoped list/detail/count and coordinate redaction

Remaining:
- Real signed-session Route Handler integration tests
- MFA and role authorization integration
- Real network HTTP smoke tests
- Independent security review
- Production deployment verification

Status: IN PROGRESS — not production approved.