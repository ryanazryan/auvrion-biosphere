/** AB-WC-017 Slice 03B — device scoped LISTEN WAV ingestion with fail-closed receipts. */
import "server-only";
import { open } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import {
  readPrivateWav,
  savePrivateWav,
} from "@/server/evidence/private-storage";
import {
  RecordingError,
  recordingFingerprint,
  type VerifiedWav,
} from "./device-recording-protocol";
import type { ListenMetadata } from "./device-security";
import { verifyDeviceToken } from "./device-security";

export type RecordingAck = {
  protocolVersion: 1;
  status: "committed";
  receiptId: string;
  deviceId: string;
  recordingId: string;
  observationId: string;
  audioSha256: string;
  audioBytes: number;
  replayed: boolean;
};

type DeviceRow = {
  id: string;
  organization_id: string;
  source_id: string;
  credential_hash: string;
};
type ReceiptRow = {
  id: string;
  observation_id: string;
  request_sha256: string;
  audio_sha256: string;
  audio_bytes: string | number;
  storage_key: string;
};

/** Kept separate from browser-session authorization: only opaque device token applies. */
async function syncPublishedDirectory(): Promise<void> {
  // POSIX: fsync directory entry after atomic rename, before DB COMMIT.
  // Node on Windows cannot reliably open directories for fsync; see README durability limits.
  if (process.platform === "win32") return;
  const root = process.env.PRIVATE_EVIDENCE_DIR;
  if (!root) throw new RecordingError("STORAGE_UNAVAILABLE", 503);
  const handle = await open(root, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export function createDeviceRecordingService(pool: Pool) {
  async function lookup(
    deviceId: string,
    client: Pick<Pool, "query"> | PoolClient,
    locked: boolean,
  ): Promise<DeviceRow | null> {
    // Lock both device and source for mutation, preventing rotate/revoke or source disable
    // between credential validation and the committed receipt.
    const result = await client.query<DeviceRow>(
      `SELECT d.id, d.organization_id, d.source_id, d.credential_hash
         FROM ingestion_devices d
         JOIN observation_sources s ON s.id = d.source_id AND s.organization_id = d.organization_id
        WHERE d.id = $1 AND d.status = 'active' AND s.kind = 'listen_device' AND s.is_active = true
        ${locked ? "FOR SHARE OF d, s" : ""}`,
      [deviceId],
    );
    return result.rows[0] ?? null;
  }
  async function authenticate(deviceId: string, token: string): Promise<void> {
    const row = await lookup(deviceId, pool, false);
    if (!row || !verifyDeviceToken(token, row.credential_hash)) {
      throw new RecordingError("INVALID_DEVICE_CREDENTIAL", 401);
    }
  }

  async function verifyStored(
    row: ReceiptRow,
    sha256: string,
    length: number,
  ): Promise<void> {
    if (row.audio_sha256 !== sha256 || Number(row.audio_bytes) !== length) {
      throw new RecordingError("RECEIPT_INTEGRITY_FAILURE", 503);
    }
    try {
      const bytes = await readPrivateWav(row.storage_key, sha256);
      if (bytes.byteLength !== length) throw new Error("INVALID_WAV_LENGTH");
    } catch {
      throw new RecordingError("RECEIPT_INTEGRITY_FAILURE", 503);
    }
  }
  async function ingest(input: {
    deviceId: string;
    token: string;
    metadata: ListenMetadata;
    wav: VerifiedWav;
  }): Promise<RecordingAck> {
    // Defense in depth: never rely solely on the HTTP adapter for metadata/file matching.
    if (
      input.metadata.audioSha256 !== input.wav.sha256 ||
      input.metadata.audioBytes !== input.wav.byteLength ||
      Math.abs(input.metadata.durationMs - input.wav.durationMs) > 2
    ) {
      throw new RecordingError("RECORDING_PAYLOAD_MISMATCH", 422);
    }
    const client = await pool.connect();
    let txOpen = false;
    let receipt: ReceiptRow | undefined;
    let replayed = false;
    try {
      await client.query("BEGIN");
      txOpen = true;
      // A short statement timeout prevents an unbounded device request from occupying the pool.
      await client.query("SET LOCAL statement_timeout = '15000ms'");
      const device = await lookup(input.deviceId, client, true);
      if (!device || !verifyDeviceToken(input.token, device.credential_hash)) {
        throw new RecordingError("INVALID_DEVICE_CREDENTIAL", 401);
      }
      const fingerprint = recordingFingerprint(
        device.organization_id,
        device.source_id,
        input.metadata,
      );
      // Serialize retries for the same logical recording; hash collision only delays unrelated IDs.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`wc017:${input.deviceId}:${input.metadata.recordingId}`],
      );
      const previous = await client.query<ReceiptRow>(
        `SELECT id, observation_id, request_sha256, audio_sha256, audio_bytes, storage_key
           FROM ingestion_recordings
          WHERE device_id = $1 AND recording_id = $2 AND organization_id = $3`,
        [input.deviceId, input.metadata.recordingId, device.organization_id],
      );
      if (previous.rows[0]) {
        receipt = previous.rows[0];
        if (
          receipt.request_sha256 !== fingerprint ||
          receipt.audio_sha256 !== input.wav.sha256 ||
          Number(receipt.audio_bytes) !== input.wav.byteLength
        ) {
          throw new RecordingError("RECORDING_ID_CONFLICT", 409);
        }
        // A row by itself is never grounds for an ACK: prove file is still available.
        await verifyStored(receipt, input.wav.sha256, input.wav.byteLength);
        replayed = true;
      } else {
        // Device clock is advisory unless explicitly verified; never invent a trusted timestamp or location.
        const observedAt =
          input.metadata.clockQuality === "rtc_verified"
            ? input.metadata.observedAt
            : null;
        const reason = observedAt ? null : "device_clock_unverified";
        // File content is fsynced and atomically published by the existing private WAV store.
        // If any subsequent DB stage fails, DO NOT ACK. An orphan may need offline reconciliation.
        const stored = await savePrivateWav(input.wav.bytes, "audio/wav");
        if (
          stored.sha256 !== input.wav.sha256 ||
          stored.byteLength !== input.wav.byteLength
        ) {
          throw new RecordingError("STORAGE_INTEGRITY_FAILURE", 503);
        }
        await readPrivateWav(stored.storageKey, stored.sha256);
        await syncPublishedDirectory();
        const created = await client.query<{ id: string }>(
          `INSERT INTO observations
            (organization_id, source_id, source_record_id, domain, ingestion_mode,
             observed_at, unknown_observed_time_reason, location_unknown_reason, quality)
           VALUES ($1, $2, $3, 'biodiversity', $4, $5, $6, 'not-collected', 'unreviewed')
           RETURNING id`,
          [
            device.organization_id,
            device.source_id,
            `${input.deviceId}:${input.metadata.recordingId}`,
            input.metadata.ingestionMode,
            observedAt,
            reason,
          ],
        );
        const observationId = created.rows[0]?.id;
        if (!observationId)
          throw new RecordingError("INGESTION_UNAVAILABLE", 503);
        await client.query(
          `INSERT INTO observation_provenance
             (observation_id, original_identifier, acquisition_method, attribution, limitations, payload_sha256)
           VALUES ($1, $2, 'listen_device_wav', $3, $4::jsonb, $5)`,
          [
            observationId,
            input.metadata.recordingId,
            `device:${input.deviceId}`,
            JSON.stringify(
              input.metadata.clockQuality === "rtc_verified"
                ? []
                : ["unverified_device_clock"],
            ),
            fingerprint,
          ],
        );
        const inserted = await client.query<ReceiptRow>(
          `INSERT INTO ingestion_recordings
             (organization_id, device_id, source_id, observation_id, recording_id,
              request_sha256, audio_sha256, audio_bytes, duration_ms, storage_key,
              clock_quality, declared_observed_at, ingestion_mode)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING id, observation_id, request_sha256, audio_sha256, audio_bytes, storage_key`,
          [
            device.organization_id,
            input.deviceId,
            device.source_id,
            observationId,
            input.metadata.recordingId,
            fingerprint,
            stored.sha256,
            stored.byteLength,
            input.wav.durationMs,
            stored.storageKey,
            input.metadata.clockQuality,
            input.metadata.observedAt,
            input.metadata.ingestionMode,
          ],
        );
        receipt = inserted.rows[0];
        if (!receipt) throw new RecordingError("INGESTION_UNAVAILABLE", 503);
      }
      await client.query("COMMIT");
      txOpen = false;
    } catch (error) {
      if (txOpen) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof RecordingError) throw error;
      // COMMIT may have succeeded but network connection failed. Never ACK or delete file
      // on an ambiguous outcome. Identical firmware retry will reconcile via receipt + file.
      throw new RecordingError("INGESTION_UNAVAILABLE", 503);
    } finally {
      client.release();
    }
    if (!receipt) throw new RecordingError("INGESTION_UNAVAILABLE", 503);
    // Re-check *after* PostgreSQL COMMIT. ACK only with persisted row AND readable matching file.
    await verifyStored(receipt, input.wav.sha256, input.wav.byteLength);
    return {
      protocolVersion: 1,
      status: "committed",
      receiptId: receipt.id,
      deviceId: input.deviceId,
      recordingId: input.metadata.recordingId,
      observationId: receipt.observation_id,
      audioSha256: input.wav.sha256,
      audioBytes: input.wav.byteLength,
      replayed,
    };
  }
  return { authenticate, ingest };
}
