import { parseAudioByteRange } from "@/server/evidence/playback-range";
import {
  EvidencePlaybackError,
  readAuthorizedObservationAudio,
} from "@/server/evidence/playback-service";
import { isUuid } from "@/server/observations/observation-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// AB-WC-010 — Private Audio Playback Security Headers
// ============================================================

const securityHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
};

// ============================================================
// JSON Response Helper
// ============================================================

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: securityHeaders,
  });
}

// ============================================================
// GET — Authorized Private WAV Playback
// ============================================================

/**
 * GET /api/observations/[id]/evidence/audio/[mediaId]
 *
 * Required query:
 * - organizationId: UUID
 *
 * Authentication and security:
 * - signed Better Auth session
 * - active user account
 * - operator role in the selected organization
 * - current-session MFA assurance
 * - organization and observation isolation
 * - available evidence metadata
 * - private WAV integrity verification (SHA-256)
 *
 * Supported responses:
 * - 200: full WAV
 * - 206: partial WAV (single byte range)
 * - 400: invalid identifiers or query
 * - 401: unauthenticated
 * - 403: access denied
 * - 404: evidence not found
 * - 416: invalid or unsatisfiable byte range
 * - 503: evidence reconciliation required
 *
 * Internal storage keys and filesystem paths are never
 * included in HTTP responses.
 */
export async function GET(
  request: Request,
  context: {
    params: Promise<{
      id: string;
      mediaId: string;
    }>;
  },
): Promise<Response> {
  // ----------------------------------------------------------
  // 1. Resolve dynamic route parameters
  // ----------------------------------------------------------

  const { id: observationId, mediaId } = await context.params;

  // ----------------------------------------------------------
  // 2. Validate organization selector and UUIDs
  // ----------------------------------------------------------

  const query = new URL(request.url).searchParams;
  const organizationId = query.get("organizationId");

  if (
    !isUuid(observationId) ||
    !isUuid(mediaId) ||
    !isUuid(organizationId) ||
    query.size !== 1 ||
    query.getAll("organizationId").length !== 1
  ) {
    return json(
      {
        error: "INVALID_AUDIO_PLAYBACK_TARGET",
      },
      400,
    );
  }

  try {
    // --------------------------------------------------------
    // 3. Authorize and verify private evidence
    // --------------------------------------------------------

    /**
     * readAuthorizedObservationAudio() is responsible for:
     *
     * - signed-session authentication
     * - role and organization checks
     * - current-session MFA assurance
     * - observation and evidence-link validation
     * - evidence availability checks
     * - private filesystem access
     * - SHA-256 file integrity verification
     * - WAV structure validation
     *
     * No audio bytes can be returned until these checks
     * complete successfully.
     */
    const { bytes } = await readAuthorizedObservationAudio({
      organizationId,
      observationId,
      mediaId,
    });

    const total = bytes.byteLength;

    // --------------------------------------------------------
    // 4. Parse HTTP Range header
    // --------------------------------------------------------

    const range = parseAudioByteRange(request.headers.get("range"), total);

    // --------------------------------------------------------
    // 5. Reject invalid or unsatisfiable byte ranges
    // --------------------------------------------------------

    if (range.kind === "invalid") {
      return new Response(null, {
        status: 416,
        headers: {
          ...securityHeaders,
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes */${total}`,
          "Content-Length": "0",
        },
      });
    }

    // --------------------------------------------------------
    // 6. Determine full or partial byte boundaries
    // --------------------------------------------------------

    const start = range.kind === "partial" ? range.start : 0;

    const end = range.kind === "partial" ? range.end : total - 1;

    /**
     * HTTP byte ranges use inclusive boundaries.
     *
     * Example:
     * bytes=0-99 -> 100 bytes
     */
    const chunk = bytes.subarray(start, end + 1);

    // --------------------------------------------------------
    // 7. Create a safe response body
    // --------------------------------------------------------

    /**
     * Copy the selected bytes into a dedicated ArrayBuffer.
     *
     * This avoids TypeScript 6 / Fetch BodyInit
     * incompatibilities with Node.js Buffer.
     */
    const body = new Uint8Array(new ArrayBuffer(chunk.byteLength));

    body.set(chunk);

    // --------------------------------------------------------
    // 8. Set private playback response headers
    // --------------------------------------------------------

    const headers: Record<string, string> = {
      ...securityHeaders,
      "Content-Type": "audio/wav",
      "Content-Disposition": 'inline; filename="evidence.wav"',
      "Content-Length": String(body.byteLength),
      "Accept-Ranges": "bytes",
    };

    // --------------------------------------------------------
    // 9. Set Content-Range for partial responses
    // --------------------------------------------------------

    if (range.kind === "partial") {
      headers["Content-Range"] = `bytes ${start}-${end}/${total}`;
    }

    // --------------------------------------------------------
    // 10. Return verified audio
    // --------------------------------------------------------

    return new Response(body, {
      status: range.kind === "partial" ? 206 : 200,
      headers,
    });
  } catch (error) {
    // --------------------------------------------------------
    // 11. Handle known authorization/integrity errors
    // --------------------------------------------------------

    if (error instanceof EvidencePlaybackError) {
      return json(
        {
          error: error.reason,
        },
        error.status,
      );
    }

    // --------------------------------------------------------
    // 12. Sanitize unexpected internal failures
    // --------------------------------------------------------

    /**
     * Never expose:
     * - private storage paths
     * - storage keys
     * - database SQL errors
     * - internal stack traces
     * - filesystem error details
     */
    return json(
      {
        error: "AUDIO_PLAYBACK_FAILED",
      },
      500,
    );
  }
}
