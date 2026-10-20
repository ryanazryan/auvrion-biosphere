import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkOperationalAccess: vi.fn(),
  uploadAudioIdempotently: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.checkOperationalAccess,
}));

vi.mock("@/server/evidence/upload-orchestrator", () => ({
  uploadAudioIdempotently: mocks.uploadAudioIdempotently,
}));

vi.mock("@/server/evidence/evidence-service", () => ({
  EvidenceServiceError: class EvidenceServiceError extends Error {
    constructor(
      public status: number,
      public reason: string,
    ) {
      super(reason);
    }
  },
}));

import { EvidenceServiceError } from "@/server/evidence/evidence-service";
import { MAX_AUDIO_BYTES } from "@/server/evidence/wav-validation";
import { POST } from "./route";

const organizationId = "00000000-0000-4000-8000-000000000001";
const observationId = "00000000-0000-4000-8000-000000000002";
const mediaId = "00000000-0000-4000-8000-000000000003";

const IDEMPOTENCY_KEY = "4d5a8f20-c471-4f79-a5b2-83d1a29bc630";

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
    "Idempotency-Key": IDEMPOTENCY_KEY,
    ...options.extraHeaders,
  };

  if (options.origin !== null) {
    headers.Origin = options.origin ?? "http://localhost:3000";
  }

  const source = options.body ?? new Uint8Array([1, 2, 3]);

  // Dedicated ArrayBuffer for Node/TypeScript BodyInit compatibility.
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

  mocks.uploadAudioIdempotently.mockResolvedValue({
    mediaId,
    byteLength: 96044,
    durationSeconds: 1,
    replayed: false,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AB-WC-010 secure idempotent audio upload HTTP", () => {
  // ============================================================
  // 1. Successful first upload
  // ============================================================

  it("returns 201 for a new authorized upload", async () => {
    const response = await POST(uploadRequest(), context());

    expect(response.status).toBe(201);

    expect(mocks.checkOperationalAccess).toHaveBeenCalledWith(
      organizationId,
      "operator",
    );

    expect(mocks.uploadAudioIdempotently).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        observationId,
        idempotencyKey: IDEMPOTENCY_KEY,
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

  // ============================================================
  // 2. Idempotency header validation
  // ============================================================

  it("requires Idempotency-Key before consuming bytes", async () => {
    const request = uploadRequest();
    request.headers.delete("Idempotency-Key");

    const response = await POST(request, context());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "IDEMPOTENCY_KEY_REQUIRED",
    });

    expect(request.bodyUsed).toBe(false);
    expect(mocks.uploadAudioIdempotently).not.toHaveBeenCalled();
  });

  it("rejects malformed Idempotency-Key", async () => {
    const request = uploadRequest({
      extraHeaders: {
        "Idempotency-Key": "short",
      },
    });

    const response = await POST(request, context());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "INVALID_IDEMPOTENCY_KEY",
    });

    expect(request.bodyUsed).toBe(false);
    expect(mocks.uploadAudioIdempotently).not.toHaveBeenCalled();
  });

  // ============================================================
  // 3. Verified retry
  // ============================================================

  it("returns 200 and the original mediaId for verified replay", async () => {
    mocks.uploadAudioIdempotently.mockResolvedValue({
      mediaId,
      byteLength: 96044,
      durationSeconds: 1,
      replayed: true,
    });

    const response = await POST(uploadRequest(), context());

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      mediaId,
      byteLength: 96044,
      durationSeconds: 1,
      mimeType: "audio/wav",
    });
  });

  // ============================================================
  // 4. Conflict handling
  // ============================================================

  it("returns 409 for conflicting idempotency key", async () => {
    mocks.uploadAudioIdempotently.mockRejectedValue(
      new EvidenceServiceError(409, "IDEMPOTENCY_KEY_CONFLICT"),
    );

    const response = await POST(uploadRequest(), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "IDEMPOTENCY_KEY_CONFLICT",
    });
  });

  it("returns 409 when upload is still processing", async () => {
    mocks.uploadAudioIdempotently.mockRejectedValue(
      new EvidenceServiceError(409, "AUDIO_UPLOAD_IN_PROGRESS"),
    );

    const response = await POST(uploadRequest(), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "AUDIO_UPLOAD_IN_PROGRESS",
    });
  });

  // ============================================================
  // 5. Reconciliation handling
  // ============================================================

  it("returns 503 when evidence reconciliation is required", async () => {
    mocks.uploadAudioIdempotently.mockRejectedValue(
      new EvidenceServiceError(503, "EVIDENCE_RECONCILIATION_REQUIRED"),
    );

    const response = await POST(uploadRequest(), context());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "EVIDENCE_RECONCILIATION_REQUIRED",
    });
  });

  // ============================================================
  // 6. Origin and CSRF protection
  // ============================================================

  it("denies missing Origin", async () => {
    const response = await POST(uploadRequest({ origin: null }), context());

    expect(response.status).toBe(403);
    expect(mocks.checkOperationalAccess).not.toHaveBeenCalled();
    expect(mocks.uploadAudioIdempotently).not.toHaveBeenCalled();
  });

  it("denies cross-origin uploads", async () => {
    const response = await POST(
      uploadRequest({
        origin: "https://untrusted.example",
      }),
      context(),
    );

    expect(response.status).toBe(403);
    expect(mocks.uploadAudioIdempotently).not.toHaveBeenCalled();
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

  // ============================================================
  // 7. Target validation
  // ============================================================

  it("rejects invalid observation identifiers", async () => {
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
    expect(mocks.uploadAudioIdempotently).not.toHaveBeenCalled();
  });

  // ============================================================
  // 8. MIME and encoding validation
  // ============================================================

  it("rejects unsupported MIME before reading the body", async () => {
    const request = uploadRequest({
      mime: "application/pdf",
    });

    const response = await POST(request, context());

    expect(response.status).toBe(415);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.uploadAudioIdempotently).not.toHaveBeenCalled();
  });

  it("rejects compressed request bodies", async () => {
    const request = uploadRequest({
      extraHeaders: {
        "Content-Encoding": "gzip",
      },
    });

    const response = await POST(request, context());

    expect(response.status).toBe(415);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.uploadAudioIdempotently).not.toHaveBeenCalled();
  });

  // ============================================================
  // 9. Audio size validation
  // ============================================================

  it("rejects oversized declared content length", async () => {
    const request = uploadRequest({
      extraHeaders: {
        "Content-Length": String(MAX_AUDIO_BYTES + 1),
      },
    });

    const response = await POST(request, context());

    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.uploadAudioIdempotently).not.toHaveBeenCalled();
  });

  it("rejects actual body larger than 10 MiB", async () => {
    const response = await POST(
      uploadRequest({
        body: new Uint8Array(MAX_AUDIO_BYTES + 1),
      }),
      context(),
    );

    expect(response.status).toBe(413);
    expect(mocks.uploadAudioIdempotently).not.toHaveBeenCalled();
  });

  // ============================================================
  // 10. Authorization before consuming bytes
  // ============================================================

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
    expect(mocks.uploadAudioIdempotently).not.toHaveBeenCalled();
  });

  // ============================================================
  // 11. Empty body handling
  // ============================================================

  it("rejects an empty upload body", async () => {
    const response = await POST(uploadRequest({ body: null }), context());

    expect(response.status).toBe(400);
    expect(mocks.uploadAudioIdempotently).not.toHaveBeenCalled();
  });

  // ============================================================
  // 12. WAV validation error propagation
  // ============================================================

  it("rejects invalid WAV reported by orchestrator", async () => {
    mocks.uploadAudioIdempotently.mockRejectedValue(
      new Error("INVALID_WAV_STRUCTURE"),
    );

    const response = await POST(uploadRequest(), context());

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "INVALID_WAV_STRUCTURE",
    });
  });

  // ============================================================
  // 13. Internal error sanitization
  // ============================================================

  it("does not expose internal storage errors", async () => {
    mocks.uploadAudioIdempotently.mockRejectedValue(
      new Error("D:/private/sensitive-path"),
    );

    const response = await POST(uploadRequest(), context());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "AUDIO_UPLOAD_FAILED",
    });
  });
});
