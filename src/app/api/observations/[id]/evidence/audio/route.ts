import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { EvidenceServiceError } from "@/server/evidence/evidence-service";
import { parseIdempotencyKey } from "@/server/evidence/upload-idempotency";
import { uploadAudioIdempotently } from "@/server/evidence/upload-orchestrator";
import { MAX_AUDIO_BYTES } from "@/server/evidence/wav-validation";
import { isUuid } from "@/server/observations/observation-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store",
  Vary: "Cookie, Origin",
  "X-Content-Type-Options": "nosniff",
};

const allowedMimeTypes = new Set(["audio/wav", "audio/wave", "audio/x-wav"]);

const audioErrors = new Set([
  "INVALID_WAV_STRUCTURE",
  "INVALID_RIFF_LENGTH",
  "INVALID_WAV_CHUNK",
  "INVALID_WAV_PADDING",
  "INVALID_WAV_FORMAT",
  "DUPLICATE_AUDIO_DATA",
  "MISSING_AUDIO_DATA",
  "UNSUPPORTED_WAV_ENCODING",
  "INVALID_PCM_METADATA",
  "AUDIO_DURATION_EXCEEDED",
]);

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

/**
 * Reject cross-origin audio uploads.
 *
 * Both the Origin header and request URL must match
 * the configured trusted application origin.
 */
function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (
    !origin ||
    (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none")
  ) {
    return false;
  }

  try {
    const configured = process.env.BETTER_AUTH_URL;

    if (!configured) {
      return false;
    }

    const trustedOrigin = new URL(configured).origin;
    const requestOrigin = new URL(request.url).origin;

    return origin === trustedOrigin && requestOrigin === trustedOrigin;
  } catch {
    return false;
  }
}

type ReadResult =
  | {
      ok: true;
      bytes: Buffer;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

/**
 * Read raw upload bytes with an enforced 10 MiB limit.
 *
 * Authorization must happen before calling this function.
 */
async function readAudioBounded(
  request: Request,
  declaredLength: number | null,
): Promise<ReadResult> {
  if (!request.body) {
    return {
      ok: false,
      status: 400,
      error: "EMPTY_AUDIO_BODY",
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];

  let total = 0;

  try {
    while (true) {
      const part = await reader.read();

      if (part.done) {
        break;
      }

      if (part.value.byteLength > MAX_AUDIO_BYTES - total) {
        await reader.cancel().catch(() => {});

        return {
          ok: false,
          status: 413,
          error: "AUDIO_TOO_LARGE",
        };
      }

      total += part.value.byteLength;
      chunks.push(part.value);
    }

    if (request.signal.aborted) {
      return {
        ok: false,
        status: 400,
        error: "UPLOAD_ABORTED",
      };
    }

    if (total === 0) {
      return {
        ok: false,
        status: 400,
        error: "EMPTY_AUDIO_BODY",
      };
    }

    if (declaredLength !== null && declaredLength !== total) {
      return {
        ok: false,
        status: 400,
        error: "CONTENT_LENGTH_MISMATCH",
      };
    }

    return {
      ok: true,
      bytes: Buffer.concat(chunks, total),
    };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "UPLOAD_STREAM_FAILED",
    };
  } finally {
    reader.releaseLock();
  }
}

/**
 * Map known service and validation errors to safe
 * HTTP responses without leaking internal details.
 */
function evidenceErrorResponse(error: unknown): Response {
  if (error instanceof EvidenceServiceError) {
    return json({ error: error.reason }, error.status);
  }

  if (error instanceof Error) {
    if (error.message === "AUDIO_TOO_LARGE") {
      return json({ error: "AUDIO_TOO_LARGE" }, 413);
    }

    if (error.message === "UNSUPPORTED_AUDIO_MIME") {
      return json({ error: "UNSUPPORTED_AUDIO_MIME" }, 415);
    }

    if (audioErrors.has(error.message)) {
      return json({ error: error.message }, 422);
    }
  }

  // Never expose storage keys, filesystem paths,
  // database errors, or stack traces.
  return json({ error: "AUDIO_UPLOAD_FAILED" }, 500);
}

/**
 * AB-WC-010 — Idempotent private WAV upload endpoint.
 *
 * POST /api/observations/[id]/evidence/audio
 *
 * Required:
 * - organizationId query parameter
 * - same-origin request
 * - Idempotency-Key header
 * - supported WAV Content-Type
 * - active authenticated operator with MFA assurance
 *
 * Response:
 * - 201: newly uploaded evidence
 * - 200: verified idempotent replay
 * - 409: conflicting or in-progress upload
 * - 503: evidence reconciliation required
 */
export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const { id: observationId } = await context.params;

  const params = new URL(request.url).searchParams;
  const organizationId = params.get("organizationId");

  // Only one organization selector is permitted.
  if (
    !isUuid(observationId) ||
    !isUuid(organizationId) ||
    params.size !== 1 ||
    params.getAll("organizationId").length !== 1
  ) {
    return json(
      {
        error: "INVALID_OBSERVATION_OR_ORGANIZATION_ID",
      },
      400,
    );
  }

  // Reject requests outside the trusted application origin.
  if (!isAllowedOrigin(request)) {
    return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  }

  // Require a valid idempotency key before reading bytes.
  const parsedKey = parseIdempotencyKey(request.headers.get("idempotency-key"));

  if (!parsedKey.ok) {
    return json({ error: parsedKey.error }, 400);
  }

  // Validate the declared MIME type.
  const declaredMimeType = request.headers.get("content-type") ?? "";

  const mime = declaredMimeType.split(";")[0]?.trim().toLowerCase();

  if (!mime || !allowedMimeTypes.has(mime)) {
    return json({ error: "UNSUPPORTED_AUDIO_MIME" }, 415);
  }

  // Reject compressed request bodies.
  const encoding = request.headers.get("content-encoding");

  if (encoding && encoding.toLowerCase() !== "identity") {
    return json({ error: "CONTENT_ENCODING_NOT_ALLOWED" }, 415);
  }

  // Validate Content-Length if supplied.
  const lengthHeader = request.headers.get("content-length");

  let declaredLength: number | null = null;

  if (lengthHeader !== null) {
    if (!/^(0|[1-9]\d*)$/.test(lengthHeader)) {
      return json({ error: "INVALID_CONTENT_LENGTH" }, 400);
    }

    declaredLength = Number(lengthHeader);

    if (!Number.isSafeInteger(declaredLength)) {
      return json({ error: "INVALID_CONTENT_LENGTH" }, 400);
    }

    if (declaredLength > MAX_AUDIO_BYTES) {
      return json({ error: "AUDIO_TOO_LARGE" }, 413);
    }
  }

  /**
   * Authorization must happen before consuming request bytes.
   *
   * Check current:
   * - authenticated session
   * - account access status
   * - organization membership
   * - operator role
   * - MFA assurance
   */
  const access = await checkOperationalAccess(organizationId, "operator");

  if (!access.allowed) {
    return json({ error: access.reason }, access.status);
  }

  // Read the body within the configured upload limit.
  const uploaded = await readAudioBounded(request, declaredLength);

  if (!uploaded.ok) {
    return json({ error: uploaded.error }, uploaded.status);
  }

  try {
    /**
     * Upload orchestrator responsibilities:
     *
     * 1. Reauthorize the authenticated operator.
     * 2. Validate scoped biodiversity observation.
     * 3. Validate WAV structure and duration.
     * 4. Generate canonical upload fingerprint.
     * 5. Acquire or read PostgreSQL reservation.
     * 6. Write private WAV only for a new reservation.
     * 7. Complete media, link and reservation atomically.
     * 8. Verify stored evidence on identical retries.
     */
    const result = await uploadAudioIdempotently({
      organizationId,
      observationId,
      idempotencyKey: parsedKey.value,
      bytes: uploaded.bytes,
      declaredMimeType,
    });

    // Never reveal storageKey, file path, or SHA-256.
    return json(
      {
        mediaId: result.mediaId,
        byteLength: result.byteLength,
        durationSeconds: result.durationSeconds,
        mimeType: "audio/wav",
      },
      result.replayed ? 200 : 201,
    );
  } catch (error) {
    return evidenceErrorResponse(error);
  }
}
