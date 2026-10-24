# AB-WC-017 — LISTEN Device Security Foundation (Slice 01)

## Scope and implementation status

**Candidate implementation, not deployed, not a functional ingestion API.** This slice adds pure cryptographic and metadata contract primitives, unit tests, and a candidate Drizzle model. Firmware and PREVENT integration are deliberately excluded. Human session credentials must not be reused as device credentials.

## Contract

- Device token: `abdev_v1_` + 32 random bytes encoded in unpadded base64url. Shown once on provisioning and never logged. Store only scrypt-derived hash with random salt. Token is a bearer secret: TLS required in deployment.
- Device identity: server-registered organization and `listen_device` observation source. Client cannot choose organization/source from request body. A real ingestion endpoint must resolve scope from the verified device record.
- Lifecycle: start suspended; privileged `manage_devices` administrative workflow can activate, rotate, suspend, or revoke, after approved session assurance. Revocation must be checked from persistent database state for every ingest, not cached indefinitely.
- Metadata: version 1, stable `recordingId`, UTC `observedAt` or null, `clockQuality`, `ingestionMode`, SHA-256 of WAV bytes, byte count, duration.
- Timestamp: unverified RTC is *not* upgraded to reliable merely because a string is present. Backend must retain clock quality and `receivedAt` separately.
- Rate and payload limits: current contract caps WAV at 20 MiB and metadata at 4 KiB; actual endpoint must enforce streaming request limits and rate quotas before writing bytes. No upload API in Slice 01.
- Identity: `organizationId + sourceId + recordingId` uniquely identifies a logical recording. Request fingerprint combines identity, SHA-256 and byte size. Same ID with changed contents MUST return conflict; duplicate identical requests MAY replay committed ACK.
- Durability: a future ACK MUST be issued only once observation, provenance, private audio and ingestion event are durably committed. Client deletion MUST wait for an ACK matching device and recording fingerprint; ACK logic not present in this slice.
- Cross-scope enforcement: ensure device source kind is `listen_device`, same organization, and active; schema's simple source foreign key is not sufficient. Add a composite source/organization FK or transactional enforcement during migration review.

## Source files

- `src/server/device-ingestion/device-security.ts`: token functions, input contract parser, canonical fingerprint.
- `src/server/device-ingestion/device-security.test.ts`: deterministic contract/negative tests.
- `src/server/db/device-ingestion-schema.ts`: candidate schema *only*, excluded from `drizzle.config.ts` until migration design is reviewed.

## How to test

```sh
npx vitest run src/server/device-ingestion/device-security.test.ts
npx biome check src/server/device-ingestion src/server/db/device-ingestion-schema.ts
npm run typecheck
npm test
npm run build
```

## Next Slice 01B required before enabling device auth

1. Review lifecycle and database integrity; generate a proper Drizzle migration including the snapshot and ensure source and organization match (composite FK).
2. Add privileged provisioning/rotation/revocation service with audited human admin access and MFA; return token only once.
3. Add DB-backed authentication lookup with constant-time token validation, rate limits, and no device enumeration.
4. Add integration tests for unknown, revoked, suspended, rotated, wrong-organization devices, and concurrency.
5. Only after these gates, expose a dedicated device ingestion route in Slice 02.

No hardware or end-to-end LISTEN functionality is claimed by this slice.
