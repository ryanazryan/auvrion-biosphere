# AB-WC-023 — Figma Make Bioacoustic Workspace V2 integration

**Status:** implementation overlay for review; owner must run browser, CI and backend acceptance tests.

## Reference
Figma Make export `Auvrion Biosphere Prototipe(20261024-205435).zip`, components `BioacousticWorkspace`, `BioacousticVisualization`, `BioacousticResults`.

## Adopted features
- Real decoded PCM16 waveform and Hann-windowed STFT spectrogram in browser.
- Audio cursor, play/pause, zoom, contrast, time seeking and Nyquist labeling.
- Actual microphone input selector, disabled echo cancellation/noise suppression/AGC, live RMS input meter.
- Enriched presentation of genuine Perch candidates: generic / species-like / acoustic events and an evidence/taxonomy drawer.
- Honest uncalibrated raw scores plus relative bar position; never infer probabilistic `%`.
- Existing media upload, auth/MFA, organization scope, private evidence and Perch local worker remain untouched.

## Explicitly not implemented
- Figma Make fixture/timer analysis; no synthetic device evidence or predictions.
- Authoritative taxonomic lookups, common name mapping, conservation status and Kalimantan filtering without verified registry.
- Persistent AI results and workflow transitions.
- Detection spans or confidence percentages without backend/benchmark evidence.
- Release-readiness claim or production worker deployment.

## Review boundaries
- The owner has uncommitted changes in account activation provisioning and mailer; do not overwrite or include them accidentally in this PR.
- Original UI panel backed up before installation. Compare local diff before merging.
- Existing 16-kHz WC010 normalized WAV loses content above 8 kHz. A separate sample-rate/audio contract review is required before upgrading storage/worker pipeline.

## Suggested tests
`npm run lint && npm run typecheck && npm test && npm run build && git diff --check`

Manual regression: operator MFA access, upload+microphone playback, audio hash/private upload, worker unavailable, no mocked results, same-org scope, silence warning, taxonomy unknowns, mobile horizontal spectrogram scroll.
