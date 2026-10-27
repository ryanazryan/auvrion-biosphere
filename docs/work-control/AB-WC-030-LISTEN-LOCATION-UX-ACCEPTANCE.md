# AB-WC-030 — LISTEN recording detail UX and location attribution

This patch changes client presentation only. It does not migrate databases, alter server authorization, or mark any Work Control as Done.

## Scope

- Six compact WAV cards per page, responsive two-column layout, filters for IoT versus manually uploaded WAV, IoT-first on mixed list, and link to `/operator/listen`.
- A manual upload remains tagged manual; it is never displayed as an ESP32 receipt. A device receipt with `ingestionMode=simulation` is explicitly labeled simulation, not a physical field recording.
- Detail panel clearly separates device installation location (not currently persisted) from observation location. A risk observation with a stored point keeps the WC028 authorized map; a biodiversity observation never exposes precision coordinates through this patch.
- The existing 20-per-kind metadata discovery API remains bounded. Paging in this patch is **client-side over loaded rows**, not full-history server pagination.
- Perch inference is **on demand**, not automatically scheduled after device ingestion. Perch supports wildlife candidates, not claims of guns or chainsaws.

## Acceptance

1. Manual simulation with ~18 WAV receipts shows at most six cards and three manual pages; filter IoT returns empty, not 18 incorrectly labeled ESP32 receipts.
2. A real LISTEN-ingested observation shows a `device_recording` in its own detail, and a `Jaringan LISTEN` link opens the fleet history at `/operator/listen`.
3. For each stored WAV, authorized Operator sees a real Perch result or a real HTTP error. No silently synthesized score or sound-event claim. If worker offline, UI fails closed.
4. Filter and next/previous controls work on desktop and mobile, and keep stable React keys. `prefers-reduced-motion` is respected because there is no animated chart or moving row effect in this component.
5. Biodiversity observations do not disclose precise coordinates; environmental-risk points only appear after the existing authorized location endpoint permits it.
6. A device source with no registered deployment shows `Belum didaftarkan` and **never** copies observation coordinates into device position.
7. Case/data-quality badge preserves `unreviewed`/`valid`/`suspect`/`invalid` as stored. The display does not pretend to have performed quality review.
8. Run `npm run lint && npm run typecheck && npm test && npm run build && git diff --check` and manually test the LISTEN workflow.

## Still open

- Device deployment site model (installation coordinates, validity period, privacy tier, scope, audited API/admin form).
- PREVENT physical telemetry ingestion and separation of sensor site from fire-incident report point.
- Server-side cursor pagination for audio evidence and observations across the entire network.
- Persisted AI inference, background processing/queue, threat-sound classifier (chainsaw/gunshot), validation benchmark and human approval.
- Full authorization/E2E tests after firmware integration.
