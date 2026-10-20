import { createHash, randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkOperationalAccess: vi.fn(),
  getScopedObservation: vi.fn(),
  getDb: vi.fn(),
  reserveAudioUpload: vi.fn(),
  completeReservedAudioUpload: vi.fn(),
  failReservedAudioUpload: vi.fn(),
  savePrivateWav: vi.fn(),
  readPrivateWav: vi.fn(),
  deletePrivateWav: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.checkOperationalAccess,
}));

vi.mock("@/server/observations/observation-service", () => ({
  getScopedObservation: mocks.getScopedObservation,
}));

vi.mock("@/server/db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("./upload-reservation-service", () => ({
  reserveAudioUpload: mocks.reserveAudioUpload,
  completeReservedAudioUpload: mocks.completeReservedAudioUpload,
  failReservedAudioUpload: mocks.failReservedAudioUpload,
}));

vi.mock("./private-storage", () => ({
  savePrivateWav: mocks.savePrivateWav,
  readPrivateWav: mocks.readPrivateWav,
  deletePrivateWav: mocks.deletePrivateWav,
}));

vi.mock("./evidence-service", () => ({
  EvidenceServiceError: class EvidenceServiceError extends Error {
    constructor(
      public status: number,
      public reason: string,
    ) {
      super(reason);
    }
  },
}));

import { uploadAudioIdempotently } from "./upload-orchestrator";

const organizationId = randomUUID();
const observationId = randomUUID();
const reservationId = randomUUID();
const leaseToken = randomUUID();
const mediaId = randomUUID();
const userId = "wc010-test-operator";

function validWav(): Buffer {
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

  return wav;
}

const wav = validWav();
const digest = createHash("sha256").update(wav).digest("hex");

const stored = {
  storageKey: `${randomUUID()}.wav`,
  sha256: digest,
  mimeType: "audio/wav" as const,
  byteLength: wav.byteLength,
  durationSeconds: 1,
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16 as const,
};

const input = {
  organizationId,
  observationId,
  idempotencyKey: randomUUID(),
  declaredMimeType: "audio/wav",
  bytes: wav,
};

beforeEach(() => {
  vi.resetAllMocks();

  mocks.checkOperationalAccess.mockResolvedValue({
    allowed: true,
    organizationId,
    userId,
    role: "operator",
  });

  mocks.getScopedObservation.mockResolvedValue({
    id: observationId,
    domain: "biodiversity",
  });

  mocks.reserveAudioUpload.mockResolvedValue({
    kind: "acquired",
    reservationId,
    leaseToken,
  });

  mocks.savePrivateWav.mockResolvedValue(stored);
  mocks.deletePrivateWav.mockResolvedValue(undefined);
  mocks.readPrivateWav.mockResolvedValue(wav);

  mocks.failReservedAudioUpload.mockResolvedValue(true);

  mocks.completeReservedAudioUpload.mockResolvedValue({
    mediaId,
  });
});

describe("AB-WC-010 upload failure hardening", () => {
  it("marks reservation failed when private storage rejects", async () => {
    mocks.savePrivateWav.mockRejectedValue(
      new Error("SIMULATED_STORAGE_FAILURE"),
    );

    await expect(uploadAudioIdempotently(input)).rejects.toMatchObject({
      status: 503,
      reason: "EVIDENCE_RECONCILIATION_REQUIRED",
    });

    expect(mocks.failReservedAudioUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        observationId,
        userId,
        reservationId,
        leaseToken,
      }),
    );

    expect(mocks.completeReservedAudioUpload).not.toHaveBeenCalled();
    expect(mocks.deletePrivateWav).not.toHaveBeenCalled();
  });

  it("cleans up mismatched stored metadata before marking failed", async () => {
    const mismatched = {
      ...stored,
      sha256: "f".repeat(64),
    };

    mocks.savePrivateWav.mockResolvedValue(mismatched);

    await expect(uploadAudioIdempotently(input)).rejects.toMatchObject({
      status: 503,
    });

    expect(mocks.deletePrivateWav).toHaveBeenCalledWith(
      mismatched.storageKey,
      mismatched.sha256,
    );

    expect(mocks.failReservedAudioUpload).toHaveBeenCalledOnce();
    expect(mocks.completeReservedAudioUpload).not.toHaveBeenCalled();
  });

  it("attempts cleanup after explicit completion fencing rejection", async () => {
    mocks.completeReservedAudioUpload.mockRejectedValue(
      new Error("UPLOAD_RESERVATION_FENCE_REJECTED"),
    );

    await expect(uploadAudioIdempotently(input)).rejects.toMatchObject({
      status: 503,
      reason: "EVIDENCE_RECONCILIATION_REQUIRED",
    });

    expect(mocks.deletePrivateWav).toHaveBeenCalledWith(
      stored.storageKey,
      stored.sha256,
    );

    expect(mocks.failReservedAudioUpload).not.toHaveBeenCalled();
  });

  it("preserves private WAV when commit outcome cannot be established", async () => {
    mocks.completeReservedAudioUpload.mockRejectedValue(
      new Error("SIMULATED_CONNECTION_LOST"),
    );

    mocks.getDb.mockImplementation(() => {
      throw new Error("DATABASE_UNAVAILABLE");
    });

    await expect(uploadAudioIdempotently(input)).rejects.toMatchObject({
      status: 503,
      reason: "EVIDENCE_RECONCILIATION_REQUIRED",
    });

    // Never delete files after an ambiguous commit.
    expect(mocks.deletePrivateWav).not.toHaveBeenCalled();
    expect(mocks.failReservedAudioUpload).not.toHaveBeenCalled();
  });

  it("recovers a verified completed reservation after ambiguous commit", async () => {
    mocks.completeReservedAudioUpload.mockRejectedValue(
      new Error("SIMULATED_RESPONSE_LOST_AFTER_COMMIT"),
    );

    let selectCount = 0;

    mocks.getDb.mockReturnValue({
      select: vi.fn(() => {
        selectCount += 1;

        if (selectCount === 1) {
          // Reservation state after successful commit.
          return {
            from: () => ({
              where: () => ({
                limit: async () => [
                  {
                    status: "completed",
                    mediaId,
                  },
                ],
              }),
            }),
          };
        }

        // Evidence metadata + observation link for
        // the verified replay read.
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: async () => [
                  {
                    storageKey: stored.storageKey,
                    sha256: stored.sha256,
                    byteLength: stored.byteLength,
                    mimeType: "audio/wav",
                    availability: "available",
                    createdByUserId: userId,
                  },
                ],
              }),
            }),
          }),
        };
      }),
    });

    const result = await uploadAudioIdempotently(input);

    expect(result).toEqual({
      mediaId,
      byteLength: stored.byteLength,
      durationSeconds: 1,
      replayed: false,
    });

    expect(mocks.readPrivateWav).toHaveBeenCalledWith(
      stored.storageKey,
      stored.sha256,
    );

    expect(mocks.deletePrivateWav).not.toHaveBeenCalled();
  });
});
