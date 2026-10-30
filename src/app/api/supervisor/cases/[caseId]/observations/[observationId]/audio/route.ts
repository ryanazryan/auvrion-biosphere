import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  caseObservationLinks,
  domainCases,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import { ingestionRecordings } from "@/server/db/wc017-device-recordings-schema";
import { parseAudioByteRange } from "@/server/evidence/playback-range";
import { readPrivateWav } from "@/server/evidence/private-storage";
import {
  MAX_AUDIO_BYTES,
  validateWavPcm16,
} from "@/server/evidence/wav-validation";
import { isUuid } from "@/server/observations/observation-input";
import { findWorkspaceAccess } from "@/server/workflow/workspace-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ caseId: string; observationId: string }>;
};

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
};

function errorResponse(status: number, code: string) {
  return Response.json({ error: code }, { status, headers: privateHeaders });
}

/**
 * Supervisor-only, case-linked LISTEN audio, without exposing storage keys.
 * The same scoped SQL query checks the active case link, device provenance,
 * organization and exact observation before fetching any private bytes.
 */
export async function GET(request: Request, { params }: Context) {
  const { caseId, observationId } = await params;
  if (!isUuid(caseId) || !isUuid(observationId)) {
    return errorResponse(400, "INVALID_AUDIO_TARGET");
  }

  const access = await findWorkspaceAccess("supervisor");
  if (!access.allowed) {
    return errorResponse(access.status, access.reason);
  }

  try {
    const [record] = await getDb()
      .select({
        storageKey: ingestionRecordings.storageKey,
        audioSha256: ingestionRecordings.audioSha256,
        audioBytes: ingestionRecordings.audioBytes,
      })
      .from(ingestionRecordings)
      .innerJoin(
        caseObservationLinks,
        and(
          eq(
            caseObservationLinks.observationId,
            ingestionRecordings.observationId,
          ),
          eq(
            caseObservationLinks.organizationId,
            ingestionRecordings.organizationId,
          ),
          eq(caseObservationLinks.caseId, caseId),
          isNull(caseObservationLinks.unlinkedAt),
        ),
      )
      .innerJoin(
        domainCases,
        and(
          eq(domainCases.id, caseObservationLinks.caseId),
          eq(domainCases.organizationId, caseObservationLinks.organizationId),
        ),
      )
      .innerJoin(
        observations,
        and(
          eq(observations.id, ingestionRecordings.observationId),
          eq(observations.organizationId, ingestionRecordings.organizationId),
        ),
      )
      .innerJoin(
        observationSources,
        and(
          eq(observationSources.id, observations.sourceId),
          eq(observationSources.organizationId, observations.organizationId),
        ),
      )
      .where(
        and(
          eq(domainCases.organizationId, access.organizationId),
          eq(ingestionRecordings.organizationId, access.organizationId),
          eq(ingestionRecordings.observationId, observationId),
          eq(observationSources.kind, "listen_device"),
          eq(observations.domain, "biodiversity"),
        ),
      )
      .limit(1);

    if (!record) return errorResponse(404, "AUDIO_NOT_FOUND");
    if (
      record.audioBytes < 44 ||
      record.audioBytes > MAX_AUDIO_BYTES ||
      !/^[0-9a-f]{64}$/.test(record.audioSha256)
    ) {
      return errorResponse(503, "AUDIO_RECONCILIATION_REQUIRED");
    }

    const bytes = await readPrivateWav(record.storageKey, record.audioSha256);
    if (bytes.byteLength !== record.audioBytes) {
      return errorResponse(503, "AUDIO_RECONCILIATION_REQUIRED");
    }
    const wav = validateWavPcm16(bytes, "audio/wav");
    if (!wav.ok) return errorResponse(503, "AUDIO_RECONCILIATION_REQUIRED");

    const range = parseAudioByteRange(
      request.headers.get("range"),
      bytes.byteLength,
    );
    if (range.kind === "invalid") {
      return new Response(null, {
        status: 416,
        headers: {
          ...privateHeaders,
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes */${bytes.byteLength}`,
        },
      });
    }

    const start = range.kind === "partial" ? range.start : 0;
    const end = range.kind === "partial" ? range.end : bytes.byteLength - 1;
    const body = new Uint8Array(new ArrayBuffer(end - start + 1));
    body.set(bytes.subarray(start, end + 1));
    const headers: Record<string, string> = {
      ...privateHeaders,
      "Content-Type": "audio/wav",
      "Content-Disposition": 'inline; filename="listen-evidence.wav"',
      "Content-Length": String(body.byteLength),
      "Accept-Ranges": "bytes",
    };
    if (range.kind === "partial") {
      headers["Content-Range"] = `bytes ${start}-${end}/${bytes.byteLength}`;
    }
    return new Response(body, {
      status: range.kind === "partial" ? 206 : 200,
      headers,
    });
  } catch {
    return errorResponse(503, "AUDIO_UNAVAILABLE");
  }
}
