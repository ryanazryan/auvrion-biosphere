import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import { observations } from "@/server/db/observation-domain-schema";
import {
  evidenceLinks,
  evidenceMedia,
} from "@/server/db/operations-domain-schema";
import { ingestionRecordings } from "@/server/db/wc017-device-recordings-schema";
import { MAX_AUDIO_BYTES } from "@/server/evidence/wav-validation";
import { isUuid } from "@/server/observations/observation-input";

export type BioacousticSource = {
  kind: "human_uploaded_audio" | "device_recording";
  id: string;
  sha256: string;
  byteLength: number;
  recordedAt: string;
  ingestionMode?: "live" | "historical" | "simulation";
  integrity: "not_verified_for_analysis";
};
export type BioacousticDiscovery = {
  status: "no_audio" | "analyzer_not_configured" | "unsupported_domain";
  sources: BioacousticSource[];
  verification: "no_ai_predictions_available";
};

function requireByteLength(value: number | null): number {
  if (value === null || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error("INVALID_AUDIO_BYTE_LENGTH");
  }

  return value;
}

export class BioacousticDiscoveryError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 503,
    public readonly code: string,
  ) {
    super(code);
  }
}
const SHA = /^[0-9a-f]{64}$/;
const eligibleMetadata = (
  sha: string | null,
  bytes: number | null,
): sha is string =>
  typeof sha === "string" &&
  SHA.test(sha) &&
  typeof bytes === "number" &&
  Number.isSafeInteger(bytes) &&
  bytes >= 44 &&
  bytes <= MAX_AUDIO_BYTES;

/**
 * Find registered audio for an authorized Operator. This is metadata discovery,
 * NOT file verification, AI inference, or consent to upload audio to third parties.
 */
export async function listAuthorizedBioacousticSources(input: {
  organizationId: string;
  observationId: string;
}): Promise<BioacousticDiscovery> {
  if (!isUuid(input.organizationId) || !isUuid(input.observationId)) {
    throw new BioacousticDiscoveryError(400, "INVALID_BIOACOUSTIC_TARGET");
  }
  const access = await checkOperationalAccess(input.organizationId, "operator");
  if (!access.allowed)
    throw new BioacousticDiscoveryError(access.status, access.reason);
  const db = getDb();
  const [observation] = await db
    .select({ domain: observations.domain })
    .from(observations)
    .where(
      and(
        eq(observations.id, input.observationId),
        eq(observations.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!observation)
    throw new BioacousticDiscoveryError(404, "OBSERVATION_NOT_FOUND");
  if (observation.domain !== "biodiversity") {
    return {
      status: "unsupported_domain",
      sources: [],
      verification: "no_ai_predictions_available",
    };
  }
  const [manual, device] = await Promise.all([
    db
      .select({
        id: evidenceMedia.id,
        sha256: evidenceMedia.sha256,
        byteLength: evidenceMedia.byteLength,
        mimeType: evidenceMedia.mimeType,
        availability: evidenceMedia.availability,
        createdAt: evidenceMedia.createdAt,
      })
      .from(evidenceMedia)
      .innerJoin(
        evidenceLinks,
        and(
          eq(evidenceLinks.mediaId, evidenceMedia.id),
          eq(evidenceLinks.organizationId, evidenceMedia.organizationId),
        ),
      )
      .where(
        and(
          eq(evidenceLinks.observationId, input.observationId),
          eq(evidenceMedia.organizationId, input.organizationId),
        ),
      )
      .orderBy(desc(evidenceMedia.createdAt))
      .limit(20),
    db
      .select({
        id: ingestionRecordings.id,
        sha256: ingestionRecordings.audioSha256,
        ingestionMode: ingestionRecordings.ingestionMode,
        byteLength: ingestionRecordings.audioBytes,
        createdAt: ingestionRecordings.createdAt,
      })
      .from(ingestionRecordings)
      .where(
        and(
          eq(ingestionRecordings.organizationId, input.organizationId),
          eq(ingestionRecordings.observationId, input.observationId),
        ),
      )
      .orderBy(desc(ingestionRecordings.createdAt))
      .limit(20),
  ]);
  const sources: BioacousticSource[] = [];
  for (const row of manual) {
    if (
      row.availability !== "available" ||
      row.mimeType !== "audio/wav" ||
      !eligibleMetadata(row.sha256, row.byteLength)
    )
      continue;
    sources.push({
      kind: "human_uploaded_audio",
      id: row.id,
      sha256: row.sha256,
      byteLength: requireByteLength(row.byteLength),
      recordedAt: row.createdAt.toISOString(),
      integrity: "not_verified_for_analysis",
    });
  }
  for (const row of device) {
    if (!eligibleMetadata(row.sha256, row.byteLength)) continue;
    sources.push({
      kind: "device_recording",
      id: row.id,
      sha256: row.sha256,
      byteLength: row.byteLength,
      recordedAt: row.createdAt.toISOString(),
      ingestionMode:
        row.ingestionMode === "simulation"
          ? "simulation"
          : row.ingestionMode === "historical"
            ? "historical"
            : row.ingestionMode === "live"
              ? "live"
              : undefined,
      integrity: "not_verified_for_analysis",
    });
  }
  return {
    status: sources.length ? "analyzer_not_configured" : "no_audio",
    sources,
    verification: "no_ai_predictions_available",
  };
}
