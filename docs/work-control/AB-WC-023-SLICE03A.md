# AB-WC-023 Slice03A — Real Browser WAV → WC010 → Perch 2.0

## Implemented in this candidate overlay

- Operator-only, MFA-verified existing WC010 idempotent private WAV upload.
- Browser WAV normalization to 16-kHz mono PCM16 and browser microphone recording.
- Analysis `POST /api/observations/[id]/bioacoustics/analyze?organizationId=<UUID>` accepts **only** `{ "mediaId": "<UUID>" }`, no client filepaths or URLs.
- Authorization, observation domain, evidence link, private filesystem and SHA-256 are all verified by the existing WC010 playback service before bytes are forwarded.
- Perch 2.0 Python CPU worker is bound only to `127.0.0.1:8765` and uses a strong shared secret. No audio is sent to third-party APIs. Temporary normalized WAV is deleted after analysis.
- Results are ephemeral. No new table or durable inference audit trail yet.
- No automatic species verification, no incident creation, no Ranger task assignment.

## Constraints / deltas from Figma Make

- WC010 storage limits: max **10 MiB, 30s, WAV PCM16, mono/stereo, 16/44.1/48 kHz**. The browser converts to **16 kHz, mono** before upload. Worker converts to **32 kHz** for Perch model.
- Source audio provenance in this Slice03A is presented in the session UI; WC010 `evidenceMedia` records SHA-256, organization, observation link, creator and MIME, but does not have a new durable `sourceType` field. Do **not** claim per-file microphone provenance is persisted.
- Predictions are **raw uncalibrated scores**, not percentages. The installed Slice01 `candidate-contract.ts` has a 0..1 validation policy and must **not** be used to parse Perch 2.0 raw logits; this slice uses `perch-worker.ts` with explicit bounded raw score validation.
- Only new manual/microphone input runs through the UI. Existing WC017 device WAV association remains discovery-only pending a separate, audited path for device evidence.
- Large audio uploads are capped upstream. Python worker processes jobs serially; synchronous HTTP may timeout on underpowered machines. Enable only in local demo until queues, throttling, job persistence and replay protections are added.
- No claim of scientific accuracy without a verified Kalimantan multi-taxa dataset.

## Acceptance

- [ ] `npm run lint && npm run typecheck`
- [ ] WC023 route tests PASS
- [ ] `npm test && npm run build`
- [ ] Python worker unit tests PASS
- [ ] Operator + MFA, same-origin upload, DB link, private disk files validated locally
- [ ] Real WAV input returns new mediaId and Perch candidates (never Figma fixtures)
- [ ] unauthenticated/foreign-org/cross-origin attempts rejected
- [ ] Worker unavailable after successful upload: UI shows saved file but no invented prediction
- [ ] Secrets never committed, worker never exposed publicly
