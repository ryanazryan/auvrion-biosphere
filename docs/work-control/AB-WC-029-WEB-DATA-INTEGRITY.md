# AB-WC-029 — Operator evidence / regional weather / IoT LISTEN handoff

**Implementation candidate; not automatically DONE.** Requires local lint, typecheck, integration database and cross-role browser acceptance.

## Purpose

1. Replace native indication selectors with the shared keyboard-accessible SelectMenu.
2. Fix provenance wording: a missing license note is not an HTTP/API failure. Missing field stays missing; never invent rights/licensing.
3. Keep observation quality `unreviewed` until a separately authorized quality review is implemented. A Case transition or Supervisor signal corroboration does NOT update that flag.
4. BMKG uses verified ADM4 coverage. When an observation is outside configured ADM4 coverage, display **Open-Meteo coarse-point forecast**, not a fabricated BMKG response. A call to Open-Meteo only sends rounded (0.1°) coordinates. Its forecast remains a model, not IoT measurement.
5. LISTEN device WAV should be discoverable and readable under exactly the same observation/org/MFA authorization as manual private WAV; stored device recordings can be analyzed on demand with the existing Perch worker.
6. Split actual IoT recordings from manual microphone testing in Operator UI; do not present a laptop mic recording as ESP32 field evidence.
7. Optional opt-in Auvrion AI research permits public knowledge / company benchmarking with web search while still restricting private organizational claims to scoped DB evidence.

## BMKG ADM4 setup

Register audited ADM4 mappings using existing `AUVRION_REGIONS_JSON` environment option (server-side only). Use narrow, verified bboxes and avoid overlapping or wrong ADM4 mappings. If no mapping exists: show unavailable BMKG plus the coarse-point Open-Meteo forecast. The application must credit both BMKG and Open-Meteo separately. BMKG official source: https://data.bmkg.go.id/prakiraan-cuaca/. Open-Meteo: https://open-meteo.com/.

## Audio threat classifier — accuracy is not implemented by this patch

Perch v2 returns wildlife candidates. It is **not a calibrated chainsaw/gunshot/poaching model**. Deploy a separate acoustic-event classifier, build labeled Indonesian forest test data, evaluate precision/recall/F1 per class (chainsaw-like, gunshot-like, voices, motors, rain, natural wildlife), calibrate thresholds, review false positives and ambiguous inputs. Include unknown/abstain; never label a crime automatically. Any inference requires actual WAV hash, worker model/version, inference timestamp, and human review before accepted incidents. This patch connects existing IoT audio to the Perch analysis route; a threat model worker must be developed and validated independently.

## IoT LISTEN ACK acceptance

- Register active device and matching `listen_device` source through Admin; keep bearer token secret.
- Send valid PCM16 WAV <=30 s, <=10 MiB to `POST /api/device/recordings` per WC017, retain recordingId and checksum for retries.
- Confirm HTTP 200 ACK contains `status=committed`, `observationId`, `receiptId`; only after ACK mark SD queue record delivered.
- In Operator Observation Center find new biodiversity observation; open analysis. It must show a `device_recording` source with upload time.
- Press `Analisis Perch` on the stored IoT audio; confirm private WAV hash validation and advisory response. Failure/no worker = error, not synthetic classification.
- Check forbidden media ID / wrong organization / ranger access all fail closed; no WAV or coordinates leak.

## Before declaring work complete

`npm run lint && npm run typecheck && npm test && npm run build && git diff --check`

Test source `api/observations/[id]/evidence/audio/[mediaId]` for device media range streaming and mismatched tenant. Test BMKG same ADM4, unmapped point, Open-Meteo outage, and exact observation coordinates never returned. WC015 physical ESP32 test and acoustic threat classifier accuracy remain OPEN.
