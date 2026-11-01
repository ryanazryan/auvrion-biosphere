import { createHash } from "node:crypto";

import { checkOperationalAccess } from "@/server/authorization/operational-access";
import {
  inferPerchFromVerifiedWav,
  PerchWorkerError,
} from "@/server/bioacoustics/perch-worker";
import {
  EvidencePlaybackError,
  readAuthorizedObservationAudio,
} from "@/server/evidence/playback-service";
import { isUuid } from "@/server/observations/observation-input";
import { trustedBrowserOrigin } from "@/server/security/trusted-browser-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Origin",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: HEADERS,
  });
}

async function readSmallJson(req: Request): Promise<unknown> {
  if (!req.body) {
    throw new Error("INVALID_ANALYSIS_BODY");
  }

  const len = req.headers.get("content-length");

  if (len && (!/^\d+$/.test(len) || Number(len) > 512)) {
    throw new Error("INVALID_ANALYSIS_BODY");
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) break;

      size += result.value.byteLength;

      if (size > 512) {
        await reader.cancel().catch(() => {});
        throw new Error("INVALID_ANALYSIS_BODY");
      }

      chunks.push(result.value);
    }

    return JSON.parse(Buffer.concat(chunks, size).toString("utf8")) as unknown;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Analyze existing, authorized, persisted audio evidence.
 *
 * Security:
 * - Same-origin request
 * - Valid organization and observation identifiers
 * - Operator authorization and session assurance
 * - Private evidence authorization and integrity checks
 * - No arbitrary external URLs or file paths
 *
 * Perch results are ephemeral and unverified.
 */
export async function POST(
  req: Request,
  context: {
    params: Promise<{ id: string }>;
  },
): Promise<Response> {
  const { id } = await context.params;
  const query = new URL(req.url).searchParams;
  const organizationId = query.get("organizationId");

  if (
    !isUuid(id) ||
    !isUuid(organizationId) ||
    query.size !== 1 ||
    query.getAll("organizationId").length !== 1
  ) {
    return json({ error: "INVALID_BIOACOUSTIC_TARGET" }, 400);
  }

  if (!trustedBrowserOrigin(req, process.env)) {
    return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  }

  if (
    !/^application\/json(?:\s*;.*)?$/i.test(
      req.headers.get("content-type") ?? "",
    )
  ) {
    return json({ error: "INVALID_ANALYSIS_CONTENT_TYPE" }, 415);
  }

  let stage = "authorization";

  try {
    const access = await checkOperationalAccess(organizationId, "operator");

    if (!access.allowed) {
      return json({ error: access.reason }, access.status);
    }

    stage = "request_body";

    let input: unknown;

    try {
      input = await readSmallJson(req);
    } catch {
      return json({ error: "INVALID_ANALYSIS_BODY" }, 400);
    }

    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length !== 1 ||
      !("mediaId" in input) ||
      !isUuid(input.mediaId)
    ) {
      return json({ error: "INVALID_ANALYSIS_BODY" }, 400);
    }

    stage = "private_audio";

    const { bytes } = await readAuthorizedObservationAudio({
      organizationId,
      observationId: id,
      mediaId: input.mediaId,
    });

    stage = "sha256";

    const sha256 = createHash("sha256").update(bytes).digest("hex");

    stage = "perch_inference";

    const model = await inferPerchFromVerifiedWav(bytes);

    stage = "response_serialization";

    return json(
      {
        ...model,
        mediaId: input.mediaId,
        audioSha256: sha256,
        analyzedAt: new Date().toISOString(),
        persistence: "ephemeral_result",
      },
      200,
    );
  } catch (error) {
    // Diagnostic information remains server-side.
    // Never include stack traces or private audio in HTTP responses.
    if (process.env.NODE_ENV === "test") {
      console.error("PERCH INTERNAL ERROR:", {
        stage,
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    if (error instanceof EvidencePlaybackError) {
      return json({ error: error.reason }, error.status);
    }

    if (error instanceof PerchWorkerError) {
      const status = error.code === "PERCH_INVALID_RESULT" ? 502 : 503;

      return json({ error: error.code }, status);
    }

    return json({ error: "BIOACOUSTIC_ANALYSIS_UNAVAILABLE" }, 503);
  }
}
