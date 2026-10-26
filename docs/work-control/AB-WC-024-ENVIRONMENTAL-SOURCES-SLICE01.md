# AB-WC-024 — BMKG + NASA FIRMS + GPT-6 Luna, Slice 01

## Implemented candidate scope

- `GET /api/operator/environment/context?organizationId=...`: protected Operator + session MFA + org scope. Server-selected static demo region, 15-minute per-process cache, normalized forecast and thermal count, official provenance links, partial availability states.
- `POST /api/operator/environment/analyze?organizationId=...`: protected Operator + origin + 2KiB request cap, <=500-char question, low-cost Luna Responses API (`gpt-6-luna`, `store:false`, 550-token max output, `reasoning:low`). Six requests/user/minute **in each process** (not production distributed rate limit).
- `python scripts/apply-wc024-ui.py`: guarded UI bridge for existing Figma `OperatorAssistant` environment context only. Other contexts remain previews.
- Unit parser tests. No DB migrations, no client-selectable raw latitude/longitude, no private observation data sent to OpenAI.

## Local `.env.local` configuration — never commit secrets

```text
AUVRION_EXTERNAL_ORGANIZATION_ID=<real-authorized-organization-UUID>
AUVRION_EXTERNAL_REGION_LABEL=<region-label>
AUVRION_BMKG_ADM4=<verified-four-level-administrative-code>
AUVRION_FIRMS_BBOX=<west,south,east,north>
AUVRION_FIRMS_MAP_KEY=<secret-from-NASA-FIRMS>
OPENAI_API_KEY=<secret-from-OpenAI-API>
```

Region bbox must be finite west/south/east/north with each dimension at most 12 degrees; query is strictly server-side. Obtain NASA key from https://firms.modaps.eosdis.nasa.gov/api/map_key. Obtain ADM4 from official Indonesian administrative records; do not guess codes. Configure organization ID from real data, not a random example. The application must display **BMKG** attribution and NASA FIRMS source links.

## Technical limitations and source semantics

- BMKG is a **3-day forecast**, not actual BME280/PMS5003 sensor values. Official forecast API uses `adm4` and has 60 requests/min/IP limit.
- NASA FIRMS VIIRS NOAA-20 NRT returns **thermal anomaly detections**, not confirmed fires. Zero returned detections do not establish a safe area. NASA FIRMS MAP_KEY URL must never be logged.
- Only aggregate detections in configured bbox are returned; precise points and credentials are withheld. Time/coverage is NRT satellite availability, not 24/7 monitoring.
- Provider unavailable/malformed responses are marked unavailable, not replaced by fake values. If both sources unavailable, analysis fails closed.
- Rate limiter and cache are process-local. Production needs shared distributed persistence, source persistence, reviewed policy for data retention/egress, end-to-end acceptance and quotas.
- Luna output is advisory only; no incident creation, automatic Ranger assignment, ecological truth claims or private evidence transfer.

## Acceptance gates (NOT RUN in owner's Windows repo yet)

1. Switch to feature branch; preserve two uncommitted WC003 activation changes.
2. Extract patch at repository root, run guarded UI bridge script, format new files with Biome.
3. `npm run lint && npm run typecheck && npx vitest run src/server/environment/contracts.test.ts && npm test && npm run build` with actual dev environment.
4. Operator MFA test with real org/ADM4/bbox/API keys; invalid org, other role, no MFA and cross-origin denied.
5. Verify official BMKG forecast shape and actual NASA CSV for authorized region; scrub logs of key; compare timestamps/source data.
6. Check unavailable source, 503, rate limit, prompt injection, stale data, honest zero-hotspot interpretation, error-state UI.
7. No WC024 Done until E2E and reviewer approval.
