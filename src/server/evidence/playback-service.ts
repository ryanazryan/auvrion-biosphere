import "server-only";

import { and, eq } from "drizzle-orm";

import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import { observations } from "@/server/db/observation-domain-schema";
import {
  evidenceLinks,
  evidenceMedia,
} from "@/server/db/operations-domain-schema";
import { isUuid } from "@/server/observations/observation-input";

import { readPrivateWav } from "./private-storage";
import { MAX_AUDIO_BYTES, validateWavPcm16 } from "./wav-validation";

export class EvidencePlaybackError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 503,
    public readonly reason: string,
  ) {
    super(reason);
  }
}

type ReadAudioInput = {
  organizationId: string;
  observationId: string;
  mediaId: string;
};

/**
 * Read authorized private audio evidence.
 *
 * Security:
 * - authenticated operator with current-session MFA
 * - organization-scoped database query
 * - matching observation and evidence link
 * - available WAV metadata
 * - private file SHA-256 verification
 * - WAV structure validation
 *
 * Returns verified bytes only. Never exposes storageKey.
 */
export async function readAuthorizedObservationAudio(
  input: ReadAudioInput,
): Promise<{ bytes: Buffer }> {
  if (
    !isUuid(input.organizationId) ||
    !isUuid(input.observationId) ||
    !isUuid(input.mediaId)
  ) {
    throw new EvidencePlaybackError(400, "INVALID_AUDIO_PLAYBACK_TARGET");
  }

  const access = await checkOperationalAccess(input.organizationId, "operator");

  if (!access.allowed) {
    throw new EvidencePlaybackError(access.status, access.reason);
  }

  const [record] = await getDb()
    .select({
      storageKey: evidenceMedia.storageKey,
      sha256: evidenceMedia.sha256,
      mimeType: evidenceMedia.mimeType,
      byteLength: evidenceMedia.byteLength,
      availability: evidenceMedia.availability,
    })
    .from(evidenceMedia)
    .innerJoin(
      evidenceLinks,
      and(
        eq(evidenceLinks.mediaId, evidenceMedia.id),
        eq(evidenceLinks.organizationId, evidenceMedia.organizationId),
      ),
    )
    .innerJoin(
      observations,
      and(
        eq(observations.id, evidenceLinks.observationId),
        eq(observations.organizationId, evidenceLinks.organizationId),
      ),
    )
    .where(
      and(
        eq(evidenceMedia.organizationId, input.organizationId),
        eq(evidenceMedia.id, input.mediaId),
        eq(evidenceLinks.observationId, input.observationId),
        eq(observations.domain, "biodiversity"),
      ),
    )
    .limit(1);

  // Avoid revealing whether an inaccessible media ID exists.
  if (!record) {
    throw new EvidencePlaybackError(404, "AUDIO_EVIDENCE_NOT_FOUND");
  }

  if (
    record.availability !== "available" ||
    record.mimeType !== "audio/wav" ||
    typeof record.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.sha256) ||
    typeof record.byteLength !== "number" ||
    !Number.isSafeInteger(record.byteLength) ||
    record.byteLength <= 0 ||
    record.byteLength > MAX_AUDIO_BYTES
  ) {
    throw new EvidencePlaybackError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
  }

  try {
    // This function verifies private storage safety
    // and compares file SHA-256 to database metadata.
    const bytes = await readPrivateWav(record.storageKey, record.sha256);

    if (bytes.byteLength !== record.byteLength) {
      throw new Error("AUDIO_LENGTH_MISMATCH");
    }

    const validated = validateWavPcm16(bytes, "audio/wav");

    if (!validated.ok) {
      throw new Error("AUDIO_INTEGRITY_INVALID");
    }

    return { bytes };
  } catch {
    // Never expose private filesystem details.
    throw new EvidencePlaybackError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
  }
}
