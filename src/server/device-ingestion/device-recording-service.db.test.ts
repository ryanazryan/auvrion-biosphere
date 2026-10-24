/** Destructive fixture tests are confined to the existing isolated WC007 test DB. */
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { deletePrivateWav } from "@/server/evidence/private-storage";
import { createPostgresDeviceLifecycle } from "./device-pg-store";
import type { VerifiedWav } from "./device-recording-protocol";
import { createDeviceRecordingService } from "./device-recording-service";
import type { ListenMetadata } from "./device-security";

const RUN = process.env.RUN_WC017_DB_TESTS === "YES";
const originalPrivateRoot = process.env.PRIVATE_EVIDENCE_DIR;
const organization = randomUUID();
const actor = `wc017-03b-${randomUUID()}`;
const scoped = { organizationId: organization, manageDevices: true } as const;
function testUrl(): string {
  loadEnvFile(".env.local");
  const url = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "5433" ||
    url.pathname !== "/auvrion_dev" ||
    decodeURIComponent(url.username) !== "auvrion_dev"
  ) {
    throw new Error("WC017_REFUSING_UNKNOWN_DEV_DATABASE");
  }
  url.port = "5435";
  url.pathname = "/auvrion_wc007_test";
  return url.toString();
}
function makeWav(): Buffer {
  const pcm = Buffer.alloc(3200);
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40);
  return wav;
}
const bytes = makeWav();
const sha = createHash("sha256").update(bytes).digest("hex");
const wav: VerifiedWav = {
  bytes,
  sha256: sha,
  byteLength: bytes.length,
  durationMs: 100,
};
function meta(
  recordingId = randomUUID(),
  extra: Partial<ListenMetadata> = {},
): ListenMetadata {
  return {
    protocolVersion: 1,
    recordingId,
    observedAt: "2026-10-24T03:00:00Z",
    clockQuality: "rtc_verified",
    ingestionMode: "historical",
    audioSha256: sha,
    audioBytes: bytes.length,
    durationMs: 100,
    ...extra,
  };
}

describe.skipIf(!RUN)("AB-WC-017 Slice 03B PostgreSQL + private WAV", () => {
  let pool: Pool;
  let storageDir: string;
  let sourceId: string;
  let deviceId: string;
  let token: string;
  let fixtureCreated = false;
  const service = () => createDeviceRecordingService(pool);
  const ingest = (m: ListenMetadata, secret = token, file = wav) =>
    service().ingest({ deviceId, token: secret, metadata: m, wav: file });
  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "wc017-03b-wav-"));
    process.env.PRIVATE_EVIDENCE_DIR = storageDir;
    pool = new Pool({
      connectionString: testUrl(),
      max: 5,
      connectionTimeoutMillis: 5000,
    });
    const tables = await pool.query(`SELECT current_database() AS db,
      to_regclass('public.ingestion_recordings') AS recordings,
      to_regclass('public.ingestion_devices') AS devices`);
    if (
      tables.rows[0]?.db !== "auvrion_wc007_test" ||
      !tables.rows[0]?.recordings ||
      !tables.rows[0]?.devices
    ) {
      throw new Error("WC017_03B_TEST_DB_NOT_MIGRATED_OR_WRONG_DB");
    }
    await pool.query(
      `INSERT INTO organizations (id, code, name) VALUES ($1, $2, 'WC017 03B test')`,
      [organization, `WC017-03B-${organization}`],
    );
    await pool.query(
      `INSERT INTO "user" (id, name, email) VALUES ($1,'WC017 test',$2)`,
      [actor, `${actor}@example.invalid`],
    );
    sourceId = randomUUID();
    await pool.query(
      `INSERT INTO observation_sources (id, organization_id, kind, code, label, is_active)
      VALUES ($1,$2,'listen_device',$3,'WC017 test source',true)`,
      [sourceId, organization, `WC017-${sourceId}`],
    );
    const provisioned = await createPostgresDeviceLifecycle({
      pool,
      actorUserId: actor,
      actorOrganizationId: organization,
    }).provision(scoped, sourceId);
    deviceId = provisioned.deviceId;
    token = provisioned.token;
    fixtureCreated = true;
  }, 20000);
  afterAll(async () => {
    if (pool) {
      try {
        if (fixtureCreated) {
          await pool.query(
            "DELETE FROM ingestion_recordings WHERE organization_id=$1",
            [organization],
          );
          await pool.query(
            "DELETE FROM observation_provenance WHERE observation_id IN (SELECT id FROM observations WHERE organization_id=$1)",
            [organization],
          );
          await pool.query(
            "DELETE FROM observations WHERE organization_id=$1",
            [organization],
          );
          await pool.query(
            "DELETE FROM ingestion_device_events WHERE organization_id=$1",
            [organization],
          );
          await pool.query(
            "DELETE FROM ingestion_device_credentials WHERE organization_id=$1",
            [organization],
          );
          await pool.query(
            "DELETE FROM ingestion_devices WHERE organization_id=$1",
            [organization],
          );
          await pool.query(
            "DELETE FROM observation_sources WHERE organization_id=$1",
            [organization],
          );
          await pool.query("DELETE FROM organizations WHERE id=$1", [
            organization,
          ]);
          await pool.query('DELETE FROM "user" WHERE id=$1', [actor]);
        }
      } finally {
        await pool.end();
      }
    }
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
    if (originalPrivateRoot === undefined)
      delete process.env.PRIVATE_EVIDENCE_DIR;
    else process.env.PRIVATE_EVIDENCE_DIR = originalPrivateRoot;
  }, 20000);

  it("authenticates scoped device with current credential", async () => {
    await expect(
      service().authenticate(deviceId, token),
    ).resolves.toBeUndefined();
    await expect(
      service().authenticate(deviceId, `abdev_v1_${"B".repeat(43)}`),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("returns ACK only with persisted observation, provenance, receipt and private WAV", async () => {
    const metadata = meta();
    const ack = await ingest(metadata);
    expect(ack).toMatchObject({
      status: "committed",
      replayed: false,
      deviceId,
      recordingId: metadata.recordingId,
      audioSha256: sha,
      audioBytes: bytes.length,
    });
    const rows = await pool.query(
      `SELECT r.observation_id, r.storage_key, r.audio_sha256,
       o.domain, o.quality, o.source_record_id, p.acquisition_method, p.attribution
      FROM ingestion_recordings r JOIN observations o ON o.id=r.observation_id
      JOIN observation_provenance p ON p.observation_id=o.id WHERE r.id=$1`,
      [ack.receiptId],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]).toMatchObject({
      observation_id: ack.observationId,
      domain: "biodiversity",
      quality: "unreviewed",
      acquisition_method: "listen_device_wav",
      attribution: `device:${deviceId}`,
    });
    expect(rows.rows[0].source_record_id).toBe(
      `${deviceId}:${metadata.recordingId}`,
    );
    // Strong replay check uses a real file read and SHA verification.
    const replay = await ingest(metadata);
    expect(replay).toMatchObject({
      receiptId: ack.receiptId,
      observationId: ack.observationId,
      replayed: true,
    });
  });
  it("rejects recording-id reuse when metadata changed", async () => {
    const id = randomUUID();
    await ingest(meta(id));
    await expect(
      ingest(meta(id, { observedAt: "2026-10-24T04:00:00Z" })),
    ).rejects.toMatchObject({ code: "RECORDING_ID_CONFLICT", status: 409 });
  });
  it("concurrent identical retries create exactly one receipt", async () => {
    const id = randomUUID();
    const [first, second] = await Promise.all([
      ingest(meta(id)),
      ingest(meta(id)),
    ]);
    expect(first.receiptId).toBe(second.receiptId);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    const count = await pool.query(
      `SELECT count(*)::integer AS n FROM ingestion_recordings
      WHERE device_id=$1 AND recording_id=$2`,
      [deviceId, id],
    );
    expect(count.rows[0].n).toBe(1);
  });
  it("does not trust unverified RTC timestamp", async () => {
    const ack = await ingest(
      meta(randomUUID(), { clockQuality: "unverified" }),
    );
    const row = await pool.query(
      `SELECT o.observed_at, o.unknown_observed_time_reason,
       r.declared_observed_at FROM observations o JOIN ingestion_recordings r ON r.observation_id=o.id WHERE o.id=$1`,
      [ack.observationId],
    );
    expect(row.rows[0]).toMatchObject({
      observed_at: null,
      unknown_observed_time_reason: "device_clock_unverified",
      declared_observed_at: "2026-10-24T03:00:00Z",
    });
  });
  it("fails closed for missing/corrupted private WAV on replay", async () => {
    const metadata = meta();
    const ack = await ingest(metadata);
    const row = await pool.query(
      `SELECT storage_key FROM ingestion_recordings WHERE id=$1`,
      [ack.receiptId],
    );
    await deletePrivateWav(row.rows[0].storage_key, sha);
    await expect(ingest(metadata)).rejects.toMatchObject({
      code: "RECEIPT_INTEGRITY_FAILURE",
      status: 503,
    });
  });
  it("old rotated credential cannot ingest", async () => {
    const old = token;
    const rotated = await createPostgresDeviceLifecycle({
      pool,
      actorUserId: actor,
      actorOrganizationId: organization,
    }).rotate(scoped, deviceId);
    token = rotated.token;
    await expect(ingest(meta(), old)).rejects.toMatchObject({ status: 401 });
    await expect(
      service().authenticate(deviceId, token),
    ).resolves.toBeUndefined();
  });
  it("inactive source stops ingestion without ACK", async () => {
    await pool.query(
      "UPDATE observation_sources SET is_active=false WHERE id=$1",
      [sourceId],
    );
    await expect(ingest(meta())).rejects.toMatchObject({ status: 401 });
    await pool.query(
      "UPDATE observation_sources SET is_active=true WHERE id=$1",
      [sourceId],
    );
  });
  it("revoked device cannot ingest", async () => {
    await createPostgresDeviceLifecycle({
      pool,
      actorUserId: actor,
      actorOrganizationId: organization,
    }).revoke(scoped, deviceId);
    await expect(service().authenticate(deviceId, token)).rejects.toMatchObject(
      { status: 401 },
    );
    await expect(ingest(meta())).rejects.toMatchObject({ status: 401 });
  });
});
