import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  infer: vi.fn(),
}));

vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.access,
}));

vi.mock("@/server/evidence/playback-service", () => ({
  readAuthorizedObservationAudio: mocks.read,

  EvidencePlaybackError: class EvidencePlaybackError extends Error {
    constructor(
      public status: number,
      public reason: string,
    ) {
      super(reason);
      this.name = "EvidencePlaybackError";
    }
  },
}));

vi.mock("@/server/bioacoustics/perch-worker", () => ({
  inferPerchFromVerifiedWav: mocks.infer,

  PerchWorkerError: class PerchWorkerError extends Error {
    constructor(public code: string) {
      super(code);
      this.name = "PerchWorkerError";
    }
  },
}));

import { POST } from "./route";

const observationId = "7eccd6ac-8a62-4fd1-a982-743bcb67d592";

const organizationId = "bdc0b465-f2cc-454b-9465-de23ca714c63";

const mediaId = "57e9a749-c04f-4b42-b0ef-0dd5031078fb";

const url =
  `http://localhost:3000/api/observations/` +
  `${observationId}/bioacoustics/analyze` +
  `?organizationId=${organizationId}`;

function request(body: unknown, origin = "http://localhost:3000"): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const context = {
  params: Promise.resolve({
    id: observationId,
  }),
};

describe("WC023 Slice03A scoped real Perch analysis", () => {
  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");

    mocks.access.mockReset();
    mocks.read.mockReset();
    mocks.infer.mockReset();

    mocks.access.mockResolvedValue({
      allowed: true,
      userId: "test-operator",
      role: "operator",
    });

    mocks.read.mockImplementation(async () => ({
      bytes: Buffer.from("fake-wave-for-mocked-service"),
    }));

    mocks.infer.mockImplementation(async () => ({
      status: "succeeded",
      verification: "unverified",
      provider: "Google",
      modelId: "perch-v2",
      modelVersion: "perch_v2_cpu/1",
      candidates: [
        {
          label: "Unknown insect",
          scientificName: null,
          modelScore: 8.99,
          startMs: null,
          endMs: null,
        },
      ],
    }));
  });

  it("rejects cross-origin requests before authorization", async () => {
    const response = await POST(
      request({ mediaId }, "https://evil.invalid"),
      context,
    );

    expect(response.status).toBe(403);

    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("rejects role denial before reading private evidence", async () => {
    mocks.access.mockResolvedValue({
      allowed: false,
      reason: "ROLE_OR_SCOPE_DENIED",
      status: 403,
    });

    const response = await POST(request({ mediaId }), context);

    expect(response.status).toBe(403);

    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("rejects untrusted media IDs", async () => {
    const response = await POST(
      request({
        mediaId: "../../../private",
      }),
      context,
    );

    expect(response.status).toBe(400);

    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("refuses unexpected JSON fields", async () => {
    const response = await POST(
      request({
        mediaId,
        sourceUrl: "http://localhost/secret",
      }),
      context,
    );

    expect(response.status).toBe(400);

    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("passes only scoped, verified WAV to a private worker", async () => {
    const response = await POST(request({ mediaId }), context);

    const body = await response.json();

    if (response.status !== 200) {
      console.error("PERCH TEST DIAGNOSTIC:", {
        status: response.status,
        body,
        accessCalls: mocks.access.mock.calls,
        readCalls: mocks.read.mock.calls,
        inferCalls: mocks.infer.mock.calls,
        inferResult: mocks.infer.mock.results,
      });
    }

    expect(response.status).toBe(200);

    expect(body.verification).toBe("unverified");

    expect(body.candidates[0].modelScore).toBe(8.99);

    expect(body.persistence).toBe("ephemeral_result");

    expect(body.audioSha256).toMatch(/^[0-9a-f]{64}$/);

    expect(mocks.read).toHaveBeenCalledWith({
      observationId,
      organizationId,
      mediaId,
    });

    expect(mocks.infer).toHaveBeenCalledTimes(1);
  });
});
