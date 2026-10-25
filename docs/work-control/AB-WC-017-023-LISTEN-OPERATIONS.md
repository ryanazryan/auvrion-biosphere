# AB-WC-017 + AB-WC-023 — LISTEN Operations Workspace (Candidate)

## Implemented scope

1. Operator-only `/operator/listen` network monitoring page backed by existing `/api/operator/listen` (WC-017 device registration and server receipts). Responsive device list and per-device detail.
2. Read-only `/api/operator/listen/recordings?organizationId=<uuid>&deviceId=<uuid>` returns 20 latest committed receipts for a device, including server receipt time, declared ingestion mode, verified RTC time only when clock quality is verified, duration, audio bytes, and observation quality. Strict org + MFA check; no credentials, coordinates or storage keys.
3. Links to persisted observations; no bypass of WC-010/017 private WAV access boundaries.
4. Browser-side energy-activity markers from the actual decoded waveform (`SignalData.peaks`). Markers are **NOT AI species detections**. No species or event timestamp is invented.
5. Links from existing Operator Overview LISTEN module to the network workspace.

## Guarantees / non-goals

- Live dashboard polling means periodically refreshing receipt data, NOT 24/7 streaming and NOT proof of online presence.
- Registered/active/revoked is a lifecycle status; connectivity remains `unknown` without heartbeat.
- WC-017 ingestion mode `live` is a device-declared category; not proof of live connection.
- WC-023 Perch candidate labels remain unverified, ephemeral, and lack validated per-event timing.
- Low-level energy peaks can originate from animals, vehicles, rain, speech, wind, or other sources. Do not render species illustrations, confidence, or alerts from these markers.
- Not built: device heartbeat, continuous streaming, production job queue, automatic per-device Perch inference, persisted candidate timeline, reviewed species ID, geographic coordinates, or ranger dispatch.
- Multi-device monitoring is a read-only capability; enrollment remains Admin-only with separate privileges.

## Acceptance

1. `npx biome check --write` only touched new/modified UI files, then `npm run lint && npm run typecheck && npm test && npm run build && git diff --check`.
2. Under Operator MFA, visit `/operator/overview` and follow **Jaringan & rekaman** to `/operator/listen`.
3. Confirm empty state without registered devices, and multiple distinct devices for data-bearing orgs.
4. Select device A then B; receipts must be limited to the matching organization/device; revoked devices remain shown as historical records.
5. Confirm device registration active never shows `Online`; latest server reception is distinct from device-declared record time.
6. Cross-org or invalid org/device ID GETs are denied or 404, not data leaks; unauthenticated and unassured sessions denied.
7. Open biodiversity observation with uploaded WAV and inspect energy markers; silence shows no markers; clicks seek correct actual audio; still no timed species labels when Perch provides none.
8. Audio source, raw model score, and human verification state remain unchanged.

## Next milestones needed to reach a competitive operations product

**Phase 1 (PoC):** ESP32 I2S WAV sampling on configurable schedule, microSD offline backup, signed/authenticated retries to WC-017, RTC provenance; measure latency, failure rates, storage, and power.

**Phase 2:** Heartbeat service and explicit health SLA, device provisioning management UX, persisted AI job states, queue/retry/idempotency, no unsafe replay of private evidence.

**Phase 3:** Detector window timestamps + species-specific calibration, local ground-truth benchmark, manual positive/negative annotations, multi-label simultaneous sources, and event review workflow.

**Phase 4:** Cross-device fleet health and acoustic activity analytics, verified conservation dashboards and guarded alerts. No fabricated detection metrics.
