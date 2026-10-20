/**
 * AB-WC-010 — PostgreSQL reservation and atomic completion tests.
 *
 * Opt-in: RUN_WC010_RESERVATION_DB_TESTS=YES
 * ONLY 127.0.0.1:5435/auvrion_wc007_test.
 *
 * Synthetic fixtures are committed for cross-connection
 * visibility, then deleted using their generated IDs.
 *
 * These tests validate PostgreSQL transactions and fencing.
 * They do not write actual WAV files to private storage.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { user } from "@/server/db/auth-schema";
import { organizations } from "@/server/db/grants-schema";
import {
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import {
  evidenceLinks,
  evidenceMedia,
  evidenceUploadRequests,
} from "@/server/db/operations-domain-schema";
import {
  inspectAudioReconciliation,
  reconcileExpiredAudioReservations,
} from "./reconciliation-service";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/server/db", () => ({
  getDb: mocks.getDb,
}));

import {
  completeReservedAudioUpload,
  reserveAudioUpload,
} from "./upload-reservation-service";

const ENABLED = process.env.RUN_WC010_RESERVATION_DB_TESTS === "YES";

type Database = ReturnType<typeof drizzle>;

type Fixture = {
  organizationId: string;
  observationId: string;
  sourceId: string;
  userId: string;
};

function isolatedDatabaseUrl(): string {
  loadEnvFile(".env.local");

  const dev = new URL(process.env.DATABASE_URL ?? "postgres://invalid");

  if (
    !["postgres:", "postgresql:"].includes(dev.protocol) ||
    dev.hostname !== "127.0.0.1" ||
    dev.port !== "5433" ||
    dev.pathname !== "/auvrion_dev" ||
    decodeURIComponent(dev.username) !== "auvrion_dev"
  ) {
    throw new Error("WC010_RESERVATION_REFUSED_DEV_DATABASE");
  }

  dev.port = "5435";
  dev.pathname = "/auvrion_wc007_test";

  return dev.toString();
}

describe.skipIf(!ENABLED)("AB-WC-010 PostgreSQL upload reservation", () => {
  let pool: Pool | undefined;
  let db: Database;
  let fixture: Fixture | undefined;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: isolatedDatabaseUrl(),
      max: 5,
      connectionTimeoutMillis: 5000,
    });

    const result = await pool.query(
      `SELECT current_database() AS name,
                current_user AS username,
                to_regclass('public.evidence_upload_requests')
                  AS reservation_table`,
    );

    const identity = result.rows[0];

    if (
      identity?.name !== "auvrion_wc007_test" ||
      identity?.username !== "auvrion_dev" ||
      identity?.reservation_table !== "evidence_upload_requests"
    ) {
      throw new Error("WC010_RESERVATION_REFUSED_DATABASE_IDENTITY");
    }

    db = drizzle({ client: pool });
    mocks.getDb.mockReturnValue(db);
  }, 20000);

  beforeEach(async () => {
    fixture = {
      organizationId: randomUUID(),
      observationId: randomUUID(),
      sourceId: randomUUID(),
      userId: `wc010-reservation-${randomUUID()}`,
    };

    const f = fixture;

    await db.insert(user).values({
      id: f.userId,
      name: "WC010 Reservation Test User",
      email: `${f.userId}@example.invalid`,
      emailVerified: true,
    });

    await db.insert(organizations).values({
      id: f.organizationId,
      code: `WC010-R-${f.organizationId}`,
      name: "WC010 Reservation Test Organization",
    });

    await db.insert(observationSources).values({
      id: f.sourceId,
      organizationId: f.organizationId,
      kind: "manual",
      code: "WC010-RESERVATION-TEST",
      label: "Synthetic Test Source",
    });

    await db.insert(observations).values({
      id: f.observationId,
      organizationId: f.organizationId,
      sourceId: f.sourceId,
      domain: "biodiversity",
      ingestionMode: "historical",
      observedAt: new Date(),
      locationUnknownReason: "synthetic-test",
    });
  });

  afterEach(async () => {
    if (!fixture) return;

    const f = fixture;

    // Delete only this test's synthetic identities.
    // Respect FK dependency order.

    await db
      .delete(evidenceUploadRequests)
      .where(eq(evidenceUploadRequests.organizationId, f.organizationId));

    await db
      .delete(evidenceLinks)
      .where(eq(evidenceLinks.organizationId, f.organizationId));

    await db
      .delete(evidenceMedia)
      .where(eq(evidenceMedia.organizationId, f.organizationId));

    await db.delete(observations).where(eq(observations.id, f.observationId));

    await db
      .delete(observationSources)
      .where(eq(observationSources.id, f.sourceId));

    await db
      .delete(organizations)
      .where(eq(organizations.id, f.organizationId));

    await db.delete(user).where(eq(user.id, f.userId));

    fixture = undefined;
  });

  afterAll(async () => {
    mocks.getDb.mockReset();
    await pool?.end();
  });

  // ============================================================
  // TEST 1 — Concurrent reservation
  // ============================================================

  it("allows only one reservation across concurrent requests", async () => {
    const f = fixture;

    if (!f) {
      throw new Error("WC010_TEST_FIXTURE_MISSING");
    }

    const input = {
      organizationId: f.organizationId,
      observationId: f.observationId,
      userId: f.userId,
      idempotencyKey: randomUUID(),
      requestSha256: "a".repeat(64),
    };

    // These requests compete through actual PostgreSQL
    // connections, not an in-memory application lock.
    const results = await Promise.all([
      reserveAudioUpload(input),
      reserveAudioUpload(input),
    ]);

    expect(results.filter((result) => result.kind === "acquired")).toHaveLength(
      1,
    );

    expect(
      results.filter((result) => result.kind === "processing"),
    ).toHaveLength(1);

    const rows = await db
      .select()
      .from(evidenceUploadRequests)
      .where(eq(evidenceUploadRequests.organizationId, f.organizationId));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("processing");
    expect(rows[0]?.attempt).toBe(1);
    expect(rows[0]?.leaseToken).toBeTruthy();
  });

  // ============================================================
  // TEST 2 — Fingerprint conflict and expired lease
  // ============================================================

  it("detects fingerprint conflicts and never steals expired leases", async () => {
    const f = fixture;

    if (!f) {
      throw new Error("WC010_TEST_FIXTURE_MISSING");
    }

    const input = {
      organizationId: f.organizationId,
      observationId: f.observationId,
      userId: f.userId,
      idempotencyKey: randomUUID(),
      requestSha256: "b".repeat(64),
    };

    const first = await reserveAudioUpload(input);

    expect(first.kind).toBe("acquired");

    const conflicting = await reserveAudioUpload({
      ...input,
      requestSha256: "c".repeat(64),
    });

    expect(conflicting).toEqual({
      kind: "conflict",
    });

    // Simulate an expired processing lease.
    await db
      .update(evidenceUploadRequests)
      .set({
        leaseExpiresAt: new Date(Date.now() - 60_000),
      })
      .where(eq(evidenceUploadRequests.organizationId, f.organizationId));

    const expired = await reserveAudioUpload(input);

    expect(expired).toEqual({
      kind: "reconciliation_required",
    });

    const rows = await db
      .select()
      .from(evidenceUploadRequests)
      .where(eq(evidenceUploadRequests.organizationId, f.organizationId));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.attempt).toBe(1);

    if (first.kind === "acquired") {
      expect(rows[0]?.leaseToken).toBe(first.leaseToken);
    }
  });

  // ============================================================
  // TEST 3 — Atomic completion
  // ============================================================

  it("atomically completes one reservation with media and link", async () => {
    const f = fixture;

    if (!f) {
      throw new Error("WC010_TEST_FIXTURE_MISSING");
    }

    const request = {
      organizationId: f.organizationId,
      observationId: f.observationId,
      userId: f.userId,
      idempotencyKey: randomUUID(),
      requestSha256: "d".repeat(64),
    };

    const reservation = await reserveAudioUpload(request);

    expect(reservation.kind).toBe("acquired");

    if (reservation.kind !== "acquired") {
      throw new Error("WC010_RESERVATION_NOT_ACQUIRED");
    }

    const completed = await completeReservedAudioUpload({
      ...request,
      reservationId: reservation.reservationId,
      leaseToken: reservation.leaseToken,
      stored: {
        storageKey: `${randomUUID()}.wav`,
        sha256: "e".repeat(64),
        mimeType: "audio/wav",
        byteLength: 96044,
      },
    });

    expect(completed.mediaId).toBeTruthy();

    const [state] = await db
      .select()
      .from(evidenceUploadRequests)
      .where(eq(evidenceUploadRequests.id, reservation.reservationId));

    expect(state).toMatchObject({
      status: "completed",
      mediaId: completed.mediaId,
      leaseToken: null,
      leaseExpiresAt: null,
    });

    const media = await db
      .select()
      .from(evidenceMedia)
      .where(eq(evidenceMedia.id, completed.mediaId));

    const links = await db
      .select()
      .from(evidenceLinks)
      .where(eq(evidenceLinks.mediaId, completed.mediaId));

    expect(media).toHaveLength(1);
    expect(links).toHaveLength(1);

    expect(media[0]).toMatchObject({
      organizationId: f.organizationId,
      availability: "available",
      mimeType: "audio/wav",
      byteLength: 96044,
    });

    expect(links[0]).toMatchObject({
      organizationId: f.organizationId,
      observationId: f.observationId,
      mediaId: completed.mediaId,
    });
  });

  // ============================================================
  // TEST 4 — Invalid lease fencing and DB rollback
  // ============================================================

  it("rejects a wrong lease token and rolls back media", async () => {
    const f = fixture;

    if (!f) {
      throw new Error("WC010_TEST_FIXTURE_MISSING");
    }

    const request = {
      organizationId: f.organizationId,
      observationId: f.observationId,
      userId: f.userId,
      idempotencyKey: randomUUID(),
      requestSha256: "f".repeat(64),
    };

    const reservation = await reserveAudioUpload(request);

    if (reservation.kind !== "acquired") {
      throw new Error("WC010_RESERVATION_NOT_ACQUIRED");
    }

    // A stale or unauthorized processor uses
    // a token that does not own this reservation.
    await expect(
      completeReservedAudioUpload({
        ...request,
        reservationId: reservation.reservationId,
        leaseToken: randomUUID(),
        stored: {
          storageKey: `${randomUUID()}.wav`,
          sha256: "a".repeat(64),
          mimeType: "audio/wav",
          byteLength: 96044,
        },
      }),
    ).rejects.toThrow("UPLOAD_RESERVATION_FENCE_REJECTED");

    const media = await db
      .select()
      .from(evidenceMedia)
      .where(eq(evidenceMedia.organizationId, f.organizationId));

    const links = await db
      .select()
      .from(evidenceLinks)
      .where(eq(evidenceLinks.organizationId, f.organizationId));

    const [state] = await db
      .select()
      .from(evidenceUploadRequests)
      .where(eq(evidenceUploadRequests.id, reservation.reservationId));

    // The transaction must leave no evidence behind.
    expect(media).toHaveLength(0);
    expect(links).toHaveLength(0);

    // The reservation still belongs to the
    // original processor.
    expect(state?.status).toBe("processing");
    expect(state?.leaseToken).toBe(reservation.leaseToken);
  });

  // ============================================================
  // TEST 5 — Concurrent completion
  // ============================================================

  it("allows only one concurrent completion", async () => {
    const f = fixture;

    if (!f) {
      throw new Error("WC010_TEST_FIXTURE_MISSING");
    }

    const request = {
      organizationId: f.organizationId,
      observationId: f.observationId,
      userId: f.userId,
      idempotencyKey: randomUUID(),
      requestSha256: "b".repeat(64),
    };

    const reservation = await reserveAudioUpload(request);

    if (reservation.kind !== "acquired") {
      throw new Error("WC010_RESERVATION_NOT_ACQUIRED");
    }

    const completion = (storageKey: string) =>
      completeReservedAudioUpload({
        ...request,
        reservationId: reservation.reservationId,
        leaseToken: reservation.leaseToken,
        stored: {
          storageKey,
          sha256: "a".repeat(64),
          mimeType: "audio/wav" as const,
          byteLength: 96044,
        },
      });

    // Both use the same reservation and lease token.
    // Only one may change its status to completed.
    const results = await Promise.allSettled([
      completion(`${randomUUID()}.wav`),
      completion(`${randomUUID()}.wav`),
    ]);

    const succeeded = results.filter((result) => result.status === "fulfilled");

    const rejected = results.filter((result) => result.status === "rejected");

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    if (rejected[0]?.status === "rejected") {
      expect(rejected[0].reason).toMatchObject({
        message: "UPLOAD_RESERVATION_FENCE_REJECTED",
      });
    }

    const media = await db
      .select()
      .from(evidenceMedia)
      .where(eq(evidenceMedia.organizationId, f.organizationId));

    const links = await db
      .select()
      .from(evidenceLinks)
      .where(eq(evidenceLinks.organizationId, f.organizationId));

    const reservations = await db
      .select()
      .from(evidenceUploadRequests)
      .where(eq(evidenceUploadRequests.organizationId, f.organizationId));

    expect(media).toHaveLength(1);
    expect(links).toHaveLength(1);
    expect(reservations).toHaveLength(1);

    expect(reservations[0]?.status).toBe("completed");
    expect(reservations[0]?.mediaId).toBe(media[0]?.id);

    expect(links[0]?.mediaId).toBe(media[0]?.id);
  });

  it("reconciles an expired reservation without deleting or reacquiring evidence", async () => {
    const f = fixture;

    if (!f) {
      throw new Error("WC010_TEST_FIXTURE_MISSING");
    }

    const input = {
      organizationId: f.organizationId,
      observationId: f.observationId,
      userId: f.userId,
      idempotencyKey: randomUUID(),
      requestSha256: "e".repeat(64),
    };

    const reserved = await reserveAudioUpload(input);

    expect(reserved.kind).toBe("acquired");

    if (reserved.kind !== "acquired") {
      throw new Error("WC010_RESERVATION_NOT_ACQUIRED");
    }

    // Simulate a processor that stopped and whose lease expired.
    await db
      .update(evidenceUploadRequests)
      .set({
        leaseExpiresAt: new Date(Date.now() - 60_000),
      })
      .where(eq(evidenceUploadRequests.id, reserved.reservationId));

    const result = await reconcileExpiredAudioReservations(f.organizationId);

    expect(result.transitionedToFailed).toBeGreaterThanOrEqual(1);

    const [row] = await db
      .select()
      .from(evidenceUploadRequests)
      .where(eq(evidenceUploadRequests.id, reserved.reservationId));

    expect(row).toMatchObject({
      status: "failed",
      leaseToken: null,
      leaseExpiresAt: null,
      mediaId: null,
    });

    // Same key is not automatically stolen or retried.
    const replay = await reserveAudioUpload(input);

    expect(replay.kind).toBe("reconciliation_required");

    const mediaRows = await db
      .select()
      .from(evidenceMedia)
      .where(eq(evidenceMedia.organizationId, f.organizationId));

    expect(mediaRows).toHaveLength(0);
  });

  it("audits private WAV references, missing files and orphan candidates without deleting files", async () => {
    const f = fixture;

    if (!f) {
      throw new Error("WC010_TEST_FIXTURE_MISSING");
    }

    const privateRoot = await mkdtemp(
      join(tmpdir(), "auvrion-wc010-reconcile-"),
    );

    const previousRoot = process.env.PRIVATE_EVIDENCE_DIR;
    process.env.PRIVATE_EVIDENCE_DIR = privateRoot;

    try {
      const referencedKey = `${randomUUID()}.wav`;
      const missingKey = `${randomUUID()}.wav`;
      const orphanKey = `${randomUUID()}.wav`;
      const stagingKey = `.${randomUUID()}.wav.${randomUUID()}.part`;

      const referencedPath = join(privateRoot, referencedKey);
      const orphanPath = join(privateRoot, orphanKey);
      const stagingPath = join(privateRoot, stagingKey);

      // A valid, minimal PCM16 WAV test fixture.
      const sampleRate = 16000;
      const dataLength = sampleRate * 2;
      const wav = Buffer.alloc(44 + dataLength);

      wav.write("RIFF", 0, "ascii");
      wav.writeUInt32LE(wav.length - 8, 4);
      wav.write("WAVE", 8, "ascii");
      wav.write("fmt ", 12, "ascii");
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(sampleRate, 24);
      wav.writeUInt32LE(sampleRate * 2, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write("data", 36, "ascii");
      wav.writeUInt32LE(dataLength, 40);

      const digest = createHash("sha256").update(wav).digest("hex");

      await writeFile(referencedPath, wav);
      await writeFile(orphanPath, wav);
      await writeFile(stagingPath, wav);

      const oldTime = new Date(Date.now() - 20 * 60_000);

      await utimes(orphanPath, oldTime, oldTime);
      await utimes(stagingPath, oldTime, oldTime);

      const before = await inspectAudioReconciliation();

      await db.insert(evidenceMedia).values([
        {
          organizationId: f.organizationId,
          storageKey: referencedKey,
          availability: "available",
          sha256: digest,
          mimeType: "audio/wav",
          byteLength: wav.byteLength,
          createdByUserId: f.userId,
        },
        {
          organizationId: f.organizationId,
          storageKey: missingKey,
          availability: "available",
          sha256: digest,
          mimeType: "audio/wav",
          byteLength: wav.byteLength,
          createdByUserId: f.userId,
        },
      ]);

      const after = await inspectAudioReconciliation();

      expect(after.referencedAudio - before.referencedAudio).toBe(2);

      expect(after.missingAvailableFiles - before.missingAvailableFiles).toBe(
        1,
      );

      expect(before.unreferencedPublishedCandidates).toBe(1);
      expect(after.unreferencedPublishedCandidates).toBe(1);

      expect(before.stagingCandidates).toBe(1);
      expect(after.stagingCandidates).toBe(1);

      // Inventory and reconciliation must not delete evidence.
      expect((await stat(referencedPath)).isFile()).toBe(true);
      expect((await stat(orphanPath)).isFile()).toBe(true);
      expect((await stat(stagingPath)).isFile()).toBe(true);
    } finally {
      if (previousRoot === undefined) {
        delete process.env.PRIVATE_EVIDENCE_DIR;
      } else {
        process.env.PRIVATE_EVIDENCE_DIR = previousRoot;
      }

      await rm(privateRoot, {
        recursive: true,
        force: true,
      });
    }
  });
});
