# AB-WC-023 Slice 01 — Authorized Audio Discovery + Honest AI Panel

**Status:** Implementation candidate. No inference executed, no inference provider configured, no database migration.

## What ships
- `GET /api/observations/[id]/bioacoustics?organizationId=...`: reads only metadata for authorized Operator with current-session MFA, scoped by organization/observation.
- Sources: existing WC-010 human-uploaded evidence and WC-017 ingestion recording receipts. No filesystem location, device credential or media bytes are disclosed.
- Operator Observation Detail swaps its static text for an active audio-source/status panel. AI status remains `no_ai_predictions_available` until a real provider executes.
- Strict model-output contract for future provider: model identity + version, `unverified` verification only, bounded candidates, bounded model scores and audio segments. No automatic observation quality/status or ranger task transitions.

## Important boundaries
- Metadata in the source discovery response has NOT been revalidated from private filesystem: `integrity: not_verified_for_analysis` is deliberate. Future analyzer must read/verify WAV via existing private-storage service before actual inference.
- No cross-border audio transfer, AI API call, BirdNET install or billable inference is made in Slice 01.
- Select a model/provider only after license, species coverage, dataset and consent/retention decision; model score is not a scientifically calibrated probability.
- This endpoint is Operator-only. Supervisor API access requires separate reviewed policy. Do not weaken the operational grant/MFA guard.
- The `Tanya AI` operator UI is an existing demonstration assistant, NOT an acoustic species model.

## Next slice
1. Approved fixture WAV + explicit license/consent policy; evaluate BirdNET local inference and resource requirements.
2. Server-owned queued job, idempotent reservation, results/provenance persistence, quotas and timeout/error states; no public arbitrary audio paths.
3. Model adapter with validated structured output; confirm tests + human review workflow.
4. Expand panel to show real candidates only when persisted with explicit `unverified` tag.

## Verification needed in owner checkout
`npm run lint && npm run typecheck && npm test && npm run build && git diff --check`
No tests executed against owner checkout in this handoff.
