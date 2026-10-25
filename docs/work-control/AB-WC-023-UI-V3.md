# AB-WC-023 UI V3 / AB-WC-017 Operator LISTEN Read Model

**Status:** Candidate implementation, awaiting owner checkout CI, browser review and authorized DB regression.

## Fixes

- Prevent double `AudioContext.close()` in `SignalViewer`: cleanup and decode-finally now share an idempotent closer. No audio payload or Perch HTTP contract changed.
- Replace native microphone `<select>` with a native-details dropdown styled for Auvrion; ignore the browser's duplicated `default` and `communications` aliases. Keep real `deviceId` selection and existing raw-audio capture.
- Preserve the user's existing Play/Pause UI changes in `SignalViewer` (installer targets only the AudioContext lifecycle).
- Candidate display remains raw uncalibrated Google Perch 2.0 results. Generic events are not species, and sound-model results are not overwritten with the user's expected animal identity.
- Taxonomy drawer performs an authenticated, scoped, on-demand GBIF species name lookup only for binomial-shaped candidate labels. It requires **exact species-level matches** before displaying validated classification and optional vernacular names. GBIF validates a *name*, not the source of audio.
- No false confidence percentage, claimed Kalimantan distribution, persistence of AI decisions, or automatic species verification.

## LISTEN registration and receiving monitor

- The previous `ListenMonitor` imported demo state; V3 reads `GET /api/operator/listen?organizationId=<uuid>`.
- The route checks the current organization, Operator grant, and current-session MFA using the existing `checkOperationalAccess` policy.
- Data is drawn from `ingestion_devices`, `observation_sources`, and immutable `ingestion_recordings` for that organization; queries never return credentials, WAV storage keys, or sensitive coordinates.
- Shows multiple real device codes (LISTEN-01, LISTEN-02, ... only if actually provisioned), receipt counts, latest observed server receive time and observation link.
- Refreshes data every 10 seconds when the page is visible. Refresh frequency does not imply audio streaming or continuous presence.
- No heartbeat model or verified online signal exists. Active registration is *not online*. Even after receiving a recording, connectivity remains unknown.
- `lastIngestionMode` distinguishes live/historical/simulation as recorded by the server; "live" is a device-submitted ingestion mode, not verified real-time connectivity.
- Existing Admin device provisioning API must be used to create real device identity. Operator is read-only.

## Security and follow-ups

- Both routes return no-store responses; taxonomy accepts only a bounded two-part Latin binomial. GBIF requests have a 5-second deadline. Lookup errors never return unvalidated taxonomy as true.
- GBIF outbound requests contain the model's binomial label, not organization identity, audio, credentials, or location. Before production: consider per-actor rate limits, cache, upstream quotas, deployment network egress policy, and human taxonomy review.
- Backend direct PG read uses the same `DATABASE_URL` as AB-WC-017. Verify migration 0018/0019 are applied to the target DB.
- Before release: test Operator valid/invalid MFA, foreign organization access, empty DB, 2+ devices, one revoked device, receipt transitions, offline/GBIF timeout; run full quality gates.
- This patch deliberately does not touch `provision/route.ts` or `account-activation/mailer.ts`: review the pending login/email fix in a **separate PR**.

## Suggested validation

```bash
npx biome check --write src/figma-operator/screens/operator/BioacousticAnalysisPanel.tsx src/figma-operator/screens/operator/bioacoustic-v2/ResultView.tsx src/figma-operator/screens/operator/bioacoustic-v2/SignalViewer.tsx src/figma-operator/screens/operator/bioacoustic-v2/MicrophonePicker.tsx src/figma-operator/demo/ListenMonitor.tsx src/server/device-ingestion/listen-monitor.ts src/server/device-ingestion/listen-monitor-contract.ts src/server/device-ingestion/listen-monitor.test.ts src/server/bioacoustics/taxonomy.ts src/server/bioacoustics/taxonomy.test.ts src/app/api/operator/listen/route.ts src/app/api/bioacoustics/taxonomy/route.ts
npm run typecheck
npm test
npm run build
npm run lint
git diff --check
```

The lookups and new UI states are NOT claims of scientific species accuracy.
