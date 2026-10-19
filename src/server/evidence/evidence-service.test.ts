import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkOperationalAccess: vi.fn(),
  getScopedObservation: vi.fn(),
  getDb: vi.fn(),
  savePrivateWav: vi.fn(),
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

vi.mock("./private-storage", () => ({
  savePrivateWav: mocks.savePrivateWav,
  deletePrivateWav: mocks.deletePrivateWav,
}));

import {
  evidenceLinks,
  evidenceMedia,
} from "@/server/db/operations-domain-schema";
import {
  attachAudioToObservation,
  EvidenceServiceError,
} from "./evidence-service";

const organizationId = "00000000-0000-4000-8000-000000000001";
const observationId = "00000000-0000-4000-8000-000000000002";
const mediaId = "00000000-0000-4000-8000-000000000003";

const input = {
  organizationId,
  observationId,
  bytes: new Uint8Array([1, 2, 3]),
  declaredMimeType: "audio/wav",
};

const saved = {
  storageKey: "00000000-0000-4000-8000-000000000004.wav",
  sha256: "a".repeat(64),
  mimeType: "audio/wav",
  byteLength: 96044,
  durationSeconds: 1,
  sampleRate: 48000,
  channels: 1,
  bitsPerSample: 16,
};

function makeFakeDb(options?: { linkFails?: boolean; committed?: boolean }) {
  const mediaValues = vi.fn(() => ({
    returning: vi.fn(async () => [{ id: mediaId }]),
  }));

  const linkValues = vi.fn(async () => {
    if (options?.linkFails) {
      throw new Error("SIMULATED_LINK_FAILURE");
    }
  });

  const tx = {
    insert: vi.fn((table: unknown) => {
      if (table === evidenceMedia) {
        return { values: mediaValues };
      }

      if (table === evidenceLinks) {
        return { values: linkValues };
      }

      throw new Error("UNEXPECTED_TABLE");
    }),
  };

  const db = {
    transaction: vi.fn(
      async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    ),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => (options?.committed ? [{ id: mediaId }] : []),
        }),
      }),
    })),
  };

  mocks.getDb.mockReturnValue(db);

  return { db, tx, mediaValues, linkValues };
}

beforeEach(() => {
  vi.resetAllMocks();

  mocks.checkOperationalAccess.mockResolvedValue({
    allowed: true,
    userId: "authorized-user",
    organizationId,
    role: "operator",
  });

  mocks.getScopedObservation.mockResolvedValue({
    id: observationId,
    domain: "biodiversity",
  });

  mocks.savePrivateWav.mockResolvedValue(saved);
  mocks.deletePrivateWav.mockResolvedValue(undefined);

  makeFakeDb();
});

describe("AB-WC-010 evidence database attachment", () => {
  it("creates media and observation link in a transaction", async () => {
    const { db, tx, mediaValues, linkValues } = makeFakeDb();

    const result = await attachAudioToObservation(input);

    expect(result.mediaId).toBe(mediaId);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.insert).toHaveBeenCalledWith(evidenceMedia);
    expect(tx.insert).toHaveBeenCalledWith(evidenceLinks);

    expect(mediaValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        availability: "available",
        sha256: saved.sha256,
        createdByUserId: "authorized-user",
      }),
    );

    expect(linkValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        observationId,
        mediaId,
        linkedByUserId: "authorized-user",
      }),
    );

    expect(mocks.deletePrivateWav).not.toHaveBeenCalled();
  });

  it("denies unauthorized users before storage access", async () => {
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "ROLE_OR_SCOPE_DENIED",
    });

    await expect(attachAudioToObservation(input)).rejects.toMatchObject({
      status: 403,
      reason: "ROLE_OR_SCOPE_DENIED",
    });

    expect(mocks.savePrivateWav).not.toHaveBeenCalled();
  });

  it("rejects foreign or missing observations", async () => {
    mocks.getScopedObservation.mockResolvedValue(null);

    await expect(attachAudioToObservation(input)).rejects.toMatchObject({
      status: 404,
      reason: "OBSERVATION_NOT_FOUND",
    });

    expect(mocks.savePrivateWav).not.toHaveBeenCalled();
  });

  it("rejects environmental-risk audio attachment", async () => {
    mocks.getScopedObservation.mockResolvedValue({
      id: observationId,
      domain: "environmental_risk",
    });

    await expect(attachAudioToObservation(input)).rejects.toMatchObject({
      status: 422,
      reason: "AUDIO_REQUIRES_BIODIVERSITY_OBSERVATION",
    });

    expect(mocks.savePrivateWav).not.toHaveBeenCalled();
  });

  it("cleans up after confirmed failed database transaction", async () => {
    makeFakeDb({ linkFails: true, committed: false });

    await expect(attachAudioToObservation(input)).rejects.toBeInstanceOf(
      EvidenceServiceError,
    );

    expect(mocks.deletePrivateWav).toHaveBeenCalledWith(
      saved.storageKey,
      saved.sha256,
    );
  });

  it("does not delete files when a database commit may have succeeded", async () => {
    makeFakeDb({ linkFails: true, committed: true });

    await expect(attachAudioToObservation(input)).rejects.toMatchObject({
      status: 500,
      reason: "EVIDENCE_PERSISTENCE_FAILED",
    });

    expect(mocks.deletePrivateWav).not.toHaveBeenCalled();
  });

  it("rejects invalid identifiers before checking access", async () => {
    await expect(
      attachAudioToObservation({
        ...input,
        organizationId: "invalid",
      }),
    ).rejects.toMatchObject({
      status: 400,
      reason: "INVALID_EVIDENCE_TARGET",
    });

    expect(mocks.checkOperationalAccess).not.toHaveBeenCalled();
  });
});
