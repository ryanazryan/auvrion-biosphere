import { createHash, randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkOperationalAccess: vi.fn(),
  getDb: vi.fn(),
  readPrivateWav: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.checkOperationalAccess,
}));

vi.mock("@/server/db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("./private-storage", () => ({
  readPrivateWav: mocks.readPrivateWav,
}));

import { readAuthorizedObservationAudio } from "./playback-service";

const organizationId = randomUUID();
const observationId = randomUUID();
const mediaId = randomUUID();
const userId = "wc010-playback-operator";

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
const sha256 = createHash("sha256").update(wav).digest("hex");

const validRecord = {
  storageKey: `${randomUUID()}.wav`,
  sha256,
  mimeType: "audio/wav",
  byteLength: wav.byteLength,
  availability: "available",
};

const target = {
  organizationId,
  observationId,
  mediaId,
};

let records: Array<typeof validRecord>;

beforeEach(() => {
  vi.resetAllMocks();

  records = [{ ...validRecord }];

  mocks.checkOperationalAccess.mockResolvedValue({
    allowed: true,
    userId,
    organizationId,
    role: "operator",
  });

  mocks.readPrivateWav.mockResolvedValue(wav);

  // This mock only simulates the query result.
  // Actual tenant SQL enforcement is tested using PostgreSQL.
  mocks.getDb.mockImplementation(() => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () => [],
          }),
          innerJoin: () => ({
            where: () => ({
              limit: async () => records,
            }),
          }),
        }),
      }),
    }),
  }));
});

describe("AB-WC-010 authorized audio playback service", () => {
  it("returns verified WAV bytes for an authorized operator", async () => {
    const result = await readAuthorizedObservationAudio(target);

    expect(result.bytes).toEqual(wav);

    expect(mocks.checkOperationalAccess).toHaveBeenCalledWith(
      organizationId,
      "operator",
    );

    expect(mocks.readPrivateWav).toHaveBeenCalledWith(
      validRecord.storageKey,
      validRecord.sha256,
    );
  });

  it("rejects invalid identifiers before accessing database", async () => {
    await expect(
      readAuthorizedObservationAudio({
        ...target,
        mediaId: "invalid",
      }),
    ).rejects.toMatchObject({
      status: 400,
      reason: "INVALID_AUDIO_PLAYBACK_TARGET",
    });

    expect(mocks.checkOperationalAccess).not.toHaveBeenCalled();
    expect(mocks.readPrivateWav).not.toHaveBeenCalled();
  });

  it("rejects unauthorized users before reading media", async () => {
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "ROLE_OR_SCOPE_DENIED",
    });

    await expect(readAuthorizedObservationAudio(target)).rejects.toMatchObject({
      status: 403,
      reason: "ROLE_OR_SCOPE_DENIED",
    });

    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.readPrivateWav).not.toHaveBeenCalled();
  });

  it("rejects evidence not linked to the requested target", async () => {
    records = [];

    await expect(readAuthorizedObservationAudio(target)).rejects.toMatchObject({
      status: 404,
      reason: "AUDIO_EVIDENCE_NOT_FOUND",
    });

    expect(mocks.readPrivateWav).not.toHaveBeenCalled();
  });

  it("rejects unavailable evidence metadata", async () => {
    records = [
      {
        ...validRecord,
        availability: "uploading",
      },
    ];

    await expect(readAuthorizedObservationAudio(target)).rejects.toMatchObject({
      status: 503,
      reason: "EVIDENCE_RECONCILIATION_REQUIRED",
    });

    expect(mocks.readPrivateWav).not.toHaveBeenCalled();
  });

  it("rejects evidence with invalid stored MIME metadata", async () => {
    records = [
      {
        ...validRecord,
        mimeType: "application/octet-stream",
      },
    ];

    await expect(readAuthorizedObservationAudio(target)).rejects.toMatchObject({
      status: 503,
      reason: "EVIDENCE_RECONCILIATION_REQUIRED",
    });

    expect(mocks.readPrivateWav).not.toHaveBeenCalled();
  });

  it("rejects private-file integrity failures", async () => {
    mocks.readPrivateWav.mockRejectedValue(
      new Error("MEDIA_INTEGRITY_MISMATCH"),
    );

    await expect(readAuthorizedObservationAudio(target)).rejects.toMatchObject({
      status: 503,
      reason: "EVIDENCE_RECONCILIATION_REQUIRED",
    });
  });

  it("rejects a mismatch between file and database length", async () => {
    mocks.readPrivateWav.mockResolvedValue(wav.subarray(0, wav.length - 2));

    await expect(readAuthorizedObservationAudio(target)).rejects.toMatchObject({
      status: 503,
      reason: "EVIDENCE_RECONCILIATION_REQUIRED",
    });
  });

  it("rejects invalid WAV structure", async () => {
    mocks.readPrivateWav.mockResolvedValue(Buffer.alloc(wav.length));

    await expect(readAuthorizedObservationAudio(target)).rejects.toMatchObject({
      status: 503,
      reason: "EVIDENCE_RECONCILIATION_REQUIRED",
    });
  });
});
