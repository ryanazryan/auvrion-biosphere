import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readAuthorizedObservationAudio: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/server/evidence/playback-service", () => ({
  readAuthorizedObservationAudio: mocks.readAuthorizedObservationAudio,

  EvidencePlaybackError: class EvidencePlaybackError extends Error {
    constructor(
      public readonly status: number,
      public readonly reason: string,
    ) {
      super(reason);
      this.name = "EvidencePlaybackError";
    }
  },
}));

import { EvidencePlaybackError } from "@/server/evidence/playback-service";
import { GET } from "./route";

// ============================================================
// Test Fixtures
// ============================================================

const organizationId = randomUUID();
const observationId = randomUUID();
const mediaId = randomUUID();

const bytes = Buffer.from("0123456789", "ascii");

const url =
  `http://localhost:3000/api/observations/${observationId}` +
  `/evidence/audio/${mediaId}?organizationId=${organizationId}`;

// ============================================================
// Request Helpers
// ============================================================

function playbackRequest(
  options: { range?: string; url?: string } = {},
): Request {
  const headers = new Headers();

  if (options.range !== undefined) {
    headers.set("Range", options.range);
  }

  return new Request(options.url ?? url, {
    method: "GET",
    headers,
  });
}

/**
 * Explicit string types allow invalid identifiers to
 * be passed during negative HTTP validation tests.
 */
function context(id: string = observationId, audioMediaId: string = mediaId) {
  return {
    params: Promise.resolve({
      id,
      mediaId: audioMediaId,
    }),
  };
}

// ============================================================
// Test Setup
// ============================================================

beforeEach(() => {
  vi.resetAllMocks();

  mocks.readAuthorizedObservationAudio.mockResolvedValue({
    bytes,
  });
});

// ============================================================
// AB-WC-010 — Private Audio Playback HTTP Unit Tests
// ============================================================

describe("AB-WC-010 private audio playback HTTP", () => {
  // ----------------------------------------------------------
  // 1. Full Playback
  // ----------------------------------------------------------

  it("returns 200 and complete audio when no range is requested", async () => {
    const response = await GET(playbackRequest(), context());

    expect(response.status).toBe(200);

    expect(mocks.readAuthorizedObservationAudio).toHaveBeenCalledWith({
      organizationId,
      observationId,
      mediaId,
    });

    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);

    expect(response.headers.get("Content-Type")).toBe("audio/wav");

    expect(response.headers.get("Content-Length")).toBe(String(bytes.length));

    expect(response.headers.get("Accept-Ranges")).toBe("bytes");

    expect(response.headers.get("Cache-Control")).toContain("no-store");

    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "same-origin",
    );

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  // ----------------------------------------------------------
  // 2. Explicit Byte Range
  // ----------------------------------------------------------

  it("returns 206 for an explicit byte range", async () => {
    const response = await GET(
      playbackRequest({
        range: "bytes=0-3",
      }),
      context(),
    );

    expect(response.status).toBe(206);

    expect(response.headers.get("Content-Range")).toBe("bytes 0-3/10");

    expect(response.headers.get("Content-Length")).toBe("4");

    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      bytes.subarray(0, 4),
    );
  });

  // ----------------------------------------------------------
  // 3. Open-ended Range
  // ----------------------------------------------------------

  it("supports open-ended ranges", async () => {
    const response = await GET(
      playbackRequest({
        range: "bytes=5-",
      }),
      context(),
    );

    expect(response.status).toBe(206);

    expect(response.headers.get("Content-Range")).toBe("bytes 5-9/10");

    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      bytes.subarray(5),
    );
  });

  // ----------------------------------------------------------
  // 4. Suffix Range
  // ----------------------------------------------------------

  it("supports suffix ranges", async () => {
    const response = await GET(
      playbackRequest({
        range: "bytes=-3",
      }),
      context(),
    );

    expect(response.status).toBe(206);

    expect(response.headers.get("Content-Range")).toBe("bytes 7-9/10");

    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      bytes.subarray(7),
    );
  });

  // ----------------------------------------------------------
  // 5. Unsatisfiable Range
  // ----------------------------------------------------------

  it("returns 416 for unsatisfiable ranges", async () => {
    const response = await GET(
      playbackRequest({
        range: "bytes=100-",
      }),
      context(),
    );

    expect(response.status).toBe(416);

    expect(response.headers.get("Content-Range")).toBe("bytes */10");

    expect(response.headers.get("Content-Length")).toBe("0");

    expect(await response.text()).toBe("");

    // Authorization and file verification must happen
    // before processing byte range requests.
    expect(mocks.readAuthorizedObservationAudio).toHaveBeenCalledOnce();
  });

  // ----------------------------------------------------------
  // 6. Multipart Range Rejection
  // ----------------------------------------------------------

  it("rejects multipart ranges", async () => {
    const response = await GET(
      playbackRequest({
        range: "bytes=0-2,4-6",
      }),
      context(),
    );

    expect(response.status).toBe(416);

    expect(mocks.readAuthorizedObservationAudio).toHaveBeenCalledOnce();
  });

  // ----------------------------------------------------------
  // 7. Invalid UUID
  // ----------------------------------------------------------

  it("rejects invalid observation and media identifiers", async () => {
    const invalidObservation = await GET(
      playbackRequest(),
      context("invalid", mediaId),
    );

    expect(invalidObservation.status).toBe(400);

    const invalidMedia = await GET(
      playbackRequest(),
      context(observationId, "invalid"),
    );

    expect(invalidMedia.status).toBe(400);

    expect(mocks.readAuthorizedObservationAudio).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // 8. Duplicate Organization Selector
  // ----------------------------------------------------------

  it("rejects duplicate organization selectors", async () => {
    const response = await GET(
      playbackRequest({
        url: `${url}&organizationId=${organizationId}`,
      }),
      context(),
    );

    expect(response.status).toBe(400);

    expect(mocks.readAuthorizedObservationAudio).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // 9. Unauthenticated Request
  // ----------------------------------------------------------

  it("returns 401 when the session is missing", async () => {
    mocks.readAuthorizedObservationAudio.mockRejectedValue(
      new EvidencePlaybackError(401, "UNAUTHENTICATED"),
    );

    const response = await GET(playbackRequest(), context());

    expect(response.status).toBe(401);

    expect(await response.json()).toEqual({
      error: "UNAUTHENTICATED",
    });
  });

  // ----------------------------------------------------------
  // 10. Operational Access Denied
  // ----------------------------------------------------------

  it("returns 403 when operational access is denied", async () => {
    mocks.readAuthorizedObservationAudio.mockRejectedValue(
      new EvidencePlaybackError(403, "ROLE_OR_SCOPE_DENIED"),
    );

    const response = await GET(playbackRequest(), context());

    expect(response.status).toBe(403);

    expect(await response.json()).toEqual({
      error: "ROLE_OR_SCOPE_DENIED",
    });
  });

  // ----------------------------------------------------------
  // 11. Evidence Not Found
  // ----------------------------------------------------------

  it("returns 404 for inaccessible evidence", async () => {
    mocks.readAuthorizedObservationAudio.mockRejectedValue(
      new EvidencePlaybackError(404, "AUDIO_EVIDENCE_NOT_FOUND"),
    );

    const response = await GET(playbackRequest(), context());

    expect(response.status).toBe(404);

    expect(await response.json()).toEqual({
      error: "AUDIO_EVIDENCE_NOT_FOUND",
    });
  });

  // ----------------------------------------------------------
  // 12. Evidence Integrity Failure
  // ----------------------------------------------------------

  it("returns 503 when evidence integrity fails", async () => {
    mocks.readAuthorizedObservationAudio.mockRejectedValue(
      new EvidencePlaybackError(503, "EVIDENCE_RECONCILIATION_REQUIRED"),
    );

    const response = await GET(playbackRequest(), context());

    expect(response.status).toBe(503);

    expect(await response.json()).toEqual({
      error: "EVIDENCE_RECONCILIATION_REQUIRED",
    });
  });

  // ----------------------------------------------------------
  // 13. Internal Error Sanitization
  // ----------------------------------------------------------

  it("sanitizes unexpected internal errors", async () => {
    mocks.readAuthorizedObservationAudio.mockRejectedValue(
      new Error("D:/private/secret/audio.wav"),
    );

    const response = await GET(playbackRequest(), context());

    expect(response.status).toBe(500);

    const body = await response.json();

    expect(body).toEqual({
      error: "AUDIO_PLAYBACK_FAILED",
    });

    // Verify that internal filesystem details are not exposed.
    expect(JSON.stringify(body)).not.toContain("D:/private/secret/audio.wav");
  });
});
