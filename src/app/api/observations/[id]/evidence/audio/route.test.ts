import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkOperationalAccess: vi.fn(),
  attachAudioToObservation: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.checkOperationalAccess,
}));

vi.mock("@/server/evidence/evidence-service", () => ({
  attachAudioToObservation: mocks.attachAudioToObservation,
  EvidenceServiceError: class EvidenceServiceError extends Error {
    constructor(
      public status: number,
      public reason: string,
    ) {
      super(reason);
    }
  },
}));

import { MAX_AUDIO_BYTES } from "@/server/evidence/wav-validation";
import { POST } from "./route";

const organizationId = "00000000-0000-4000-8000-000000000001";
const observationId = "00000000-0000-4000-8000-000000000002";
const mediaId = "00000000-0000-4000-8000-000000000003";

const url =
  `http://localhost:3000/api/observations/${observationId}` +
  `/evidence/audio?organizationId=${organizationId}`;

function uploadRequest(
  options: {
    url?: string;
    body?: Uint8Array | null;
    origin?: string | null;
    mime?: string;
    extraHeaders?: Record<string, string>;
  } = {},
) {
  const headers: Record<string, string> = {
    "Content-Type": options.mime ?? "audio/wav",
    ...options.extraHeaders,
  };

  if (options.origin !== null) {
    headers.Origin = options.origin ?? "http://localhost:3000";
  }

  const source = options.body ?? new Uint8Array([1, 2, 3]);

  const safeBody = new Uint8Array(new ArrayBuffer(source.byteLength));
  safeBody.set(source);
  return new Request(options.url ?? url, {
    method: "POST",
    headers,
    body: options.body === null ? undefined : safeBody,
  });
}

function context(id = observationId) {
  return {
    params: Promise.resolve({ id }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");

  mocks.checkOperationalAccess.mockResolvedValue({
    allowed: true,
    userId: "operator-user",
    organizationId,
    role: "operator",
  });

  mocks.attachAudioToObservation.mockResolvedValue({
    mediaId,
    storageKey: "private-secret.wav",
    sha256: "a".repeat(64),
    byteLength: 96044,
    durationSeconds: 1,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AB-WC-010 secure audio upload HTTP", () => {
  it("accepts authorized raw WAV upload", async () => {
    const response = await POST(uploadRequest(), context());

    expect(response.status).toBe(201);

    expect(mocks.checkOperationalAccess).toHaveBeenCalledWith(
      organizationId,
      "operator",
    );

    expect(mocks.attachAudioToObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        observationId,
        declaredMimeType: "audio/wav",
        bytes: expect.any(Uint8Array),
      }),
    );

    expect(await response.json()).toEqual({
      mediaId,
      byteLength: 96044,
      durationSeconds: 1,
      mimeType: "audio/wav",
    });

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("denies missing Origin", async () => {
    const response = await POST(uploadRequest({ origin: null }), context());

    expect(response.status).toBe(403);
    expect(mocks.checkOperationalAccess).not.toHaveBeenCalled();
    expect(mocks.attachAudioToObservation).not.toHaveBeenCalled();
  });

  it("denies cross-origin uploads", async () => {
    const response = await POST(
      uploadRequest({
        origin: "https://untrusted.example",
      }),
      context(),
    );

    expect(response.status).toBe(403);
    expect(mocks.attachAudioToObservation).not.toHaveBeenCalled();
  });

  it("denies cross-site fetch metadata", async () => {
    const response = await POST(
      uploadRequest({
        extraHeaders: {
          "Sec-Fetch-Site": "cross-site",
        },
      }),
      context(),
    );

    expect(response.status).toBe(403);
    expect(mocks.checkOperationalAccess).not.toHaveBeenCalled();
  });

  it("rejects invalid identifiers", async () => {
    const response = await POST(uploadRequest(), context("invalid"));

    expect(response.status).toBe(400);
    expect(mocks.checkOperationalAccess).not.toHaveBeenCalled();
  });

  it("rejects duplicate organization selector", async () => {
    const response = await POST(
      uploadRequest({
        url: `${url}&organizationId=${organizationId}`,
      }),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.attachAudioToObservation).not.toHaveBeenCalled();
  });

  it("rejects unsupported MIME before reading body", async () => {
    const request = uploadRequest({
      mime: "application/pdf",
    });

    const response = await POST(request, context());

    expect(response.status).toBe(415);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.attachAudioToObservation).not.toHaveBeenCalled();
  });

  it("rejects oversized declared content length", async () => {
    const request = uploadRequest({
      extraHeaders: {
        "Content-Length": String(MAX_AUDIO_BYTES + 1),
      },
    });

    const response = await POST(request, context());

    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.attachAudioToObservation).not.toHaveBeenCalled();
  });

  it("rejects actual body larger than 10 MiB", async () => {
    const response = await POST(
      uploadRequest({
        body: new Uint8Array(MAX_AUDIO_BYTES + 1),
      }),
      context(),
    );

    expect(response.status).toBe(413);
    expect(mocks.attachAudioToObservation).not.toHaveBeenCalled();
  });

  it("rejects unauthorized users before consuming body", async () => {
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "ROLE_OR_SCOPE_DENIED",
    });

    const request = uploadRequest();
    const response = await POST(request, context());

    expect(response.status).toBe(403);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.attachAudioToObservation).not.toHaveBeenCalled();
  });

  it("rejects an empty upload body", async () => {
    const response = await POST(uploadRequest({ body: null }), context());

    expect(response.status).toBe(400);
    expect(mocks.attachAudioToObservation).not.toHaveBeenCalled();
  });

  it("rejects invalid WAV reported by the service", async () => {
    mocks.attachAudioToObservation.mockRejectedValue(
      new Error("INVALID_WAV_STRUCTURE"),
    );

    const response = await POST(uploadRequest(), context());

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "INVALID_WAV_STRUCTURE",
    });
  });

  it("does not expose internal storage errors", async () => {
    mocks.attachAudioToObservation.mockRejectedValue(
      new Error("D:/private/sensitive-path"),
    );

    const response = await POST(uploadRequest(), context());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "AUDIO_UPLOAD_FAILED",
    });
  });
});
