# AB-WC-017 Slice 03B — Device HTTP Authentication + LISTEN WAV + Durable ACK

## V1 boundary
- Physical LISTEN only; no PREVENT ingestion.
- Opaque `abdev_v1_...` Bearer credential + X-Device-Id (not Better Auth user session).
- `POST /api/device/recordings` with `Content-Type: audio/wav` and raw RIFF/WAV PCM16 body (<= 10 MiB, <= 30 seconds, 16k/44.1k/48k, 1 or 2 channels).
- Authenticated device must be active, linked to one active `listen_device` source and correctly scoped to organization.
- One `ingestion_recordings` receipt per `(device_id, recording_id)` and one observation per accepted recording.
- Both observation and receipt metadata are persisted in one PostgreSQL transaction, after private WAV file flush and atomic publication.
- DB commit and SHA-verified private file are required for HTTP 200 `committed` ACK. Existing identical recording retries return matching receipt/observation IDs with `replayed=true`.
- Conflicting replay returns 409. Missing private file returns 503, never false success.
- Server never accepts client-supplied organization, source, user, or review/quality status. Device-reported timestamps are advisory unless RTC verified; location unknown by default.

## Open follow-ups / deployment gates
- Existing evidence_media/evidence_links schema requires human actor. Do not falsely attribute device upload to provisioning admin. Device receipts link observation+private WAV; adding device-aware evidence playback/UI requires an explicit future schema/security review.
- Local private file storage requires persistent, backed-up disk in a single shared storage domain. Multi-instance/serverless deployments need object-store durability + coordinator design before use.
- POSIX directory fsync is performed after file rename; on Windows Node cannot reliably fsync directory entries. Development ACK protects against application/network retry and verified DB+file state; OS/power-loss durability on Windows is not guaranteed. ESP32 must keep its microSD copy until ACK is validated and should retain local backup according to retention policy.
- Ambiguous database commit or storage failure may leave orphan private files. No ACK is issued; never delete without a reviewed reconciliation process. Replayed committed receipts validate the file before responding.
- Enforce TLS at public ingress, request size caps, device rate limiting, monitoring, and protected PRIVATE_EVIDENCE_DIR permissions. Do not send tokens to browser/UI/analytics/logs.
- Test database is isolated; SQL migration must be reviewed before apply.
