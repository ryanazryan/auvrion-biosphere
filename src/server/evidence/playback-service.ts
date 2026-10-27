import "server-only";

import { and, eq } from "drizzle-orm";

import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import { observations } from "@/server/db/observation-domain-schema";
import {
  evidenceLinks,
  evidenceMedia,
} from "@/server/db/operations-domain-schema";
import { ingestionRecordings } from "@/server/db/wc017-device-recordings-schema";
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

  // A registered LISTEN device stores audio in WC017 receipts, not in evidence_media.
  // Never accept a receipt without matching organization, observation and biodiversity domain.
  const [deviceReceipt] = record
    ? []
    : await getDb()
        .select({
          storageKey: ingestionRecordings.storageKey,
          sha256: ingestionRecordings.audioSha256,
          byteLength: ingestionRecordings.audioBytes,
        })
        .from(ingestionRecordings)
        .innerJoin(
          observations,
          and(
            eq(observations.id, ingestionRecordings.observationId),
            eq(observations.organizationId, ingestionRecordings.organizationId),
          ),
        )
        .where(
          and(
            eq(ingestionRecordings.id, input.mediaId),
            eq(ingestionRecordings.organizationId, input.organizationId),
            eq(ingestionRecordings.observationId, input.observationId),
            eq(observations.domain, "biodiversity"),
          ),
        )
        .limit(1);
  const media =
    record ??
    (deviceReceipt
      ? {
          storageKey: deviceReceipt.storageKey,
          sha256: deviceReceipt.sha256,
          mimeType: "audio/wav" as const,
          byteLength: deviceReceipt.byteLength,
          availability: "available" as const,
        }
      : null);
  if (!media) {
    throw new EvidencePlaybackError(404, "AUDIO_EVIDENCE_NOT_FOUND");
  }

  if (
    media.availability !== "available" ||
    media.mimeType !== "audio/wav" ||
    typeof media.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(media.sha256) ||
    typeof media.byteLength !== "number" ||
    !Number.isSafeInteger(media.byteLength) ||
    media.byteLength <= 0 ||
    media.byteLength > MAX_AUDIO_BYTES
  ) {
    throw new EvidencePlaybackError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
  }

  try {
    // This function verifies private storage safety
    // and compares file SHA-256 to database metadata.
    const bytes = await readPrivateWav(media.storageKey, media.sha256);

    if (bytes.byteLength !== media.byteLength) {
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
