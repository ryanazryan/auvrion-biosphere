import "server-only";

import { and, eq } from "drizzle-orm";

import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import {
  evidenceLinks,
  evidenceMedia,
} from "@/server/db/operations-domain-schema";
import { isUuid } from "@/server/observations/observation-input";
import { getScopedObservation } from "@/server/observations/observation-service";
import { EvidenceServiceError } from "./evidence-service";
import {
  deletePrivateWav,
  readPrivateWav,
  savePrivateWav,
} from "./private-storage";
import {
  createAudioUploadFingerprint,
  parseIdempotencyKey,
} from "./upload-idempotency";
import {
  completeReservedAudioUpload,
  reserveAudioUpload,
} from "./upload-reservation-service";
import { validateWavPcm16 } from "./wav-validation";

type UploadInput = {
  organizationId: string;
  observationId: string;
  idempotencyKey: string;
  bytes: Uint8Array;
  declaredMimeType: string;
};

type UploadResult = {
  mediaId: string;
  byteLength: number;
  durationSeconds: number;
  replayed: boolean;
};

type ReplayInput = {
  organizationId: string;
  observationId: string;
  userId: string;
  mediaId: string;
  expectedSha256: string;
  expectedByteLength: number;
};

/**
 * A completed reservation is not sufficient proof that
 * the stored evidence is currently readable.
 *
 * Recheck media metadata, tenant scope, observation link,
 * creator, SHA-256, WAV structure and byte length.
 */
async function readVerifiedReplay(input: ReplayInput): Promise<UploadResult> {
  try {
    const db = getDb();

    const [record] = await db
      .select({
        storageKey: evidenceMedia.storageKey,
        sha256: evidenceMedia.sha256,
        byteLength: evidenceMedia.byteLength,
        mimeType: evidenceMedia.mimeType,
        availability: evidenceMedia.availability,
        createdByUserId: evidenceMedia.createdByUserId,
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
          eq(evidenceMedia.id, input.mediaId),
          eq(evidenceMedia.organizationId, input.organizationId),
          eq(evidenceLinks.observationId, input.observationId),
        ),
      )
      .limit(1);

    if (
      record?.availability !== "available" ||
      record.createdByUserId !== input.userId ||
      record.mimeType !== "audio/wav" ||
      record.sha256 !== input.expectedSha256 ||
      record.byteLength !== input.expectedByteLength
    ) {
      throw new Error("REPLAY_METADATA_MISMATCH");
    }

    const bytes = await readPrivateWav(record.storageKey, input.expectedSha256);

    if (bytes.byteLength !== input.expectedByteLength) {
      throw new Error("REPLAY_LENGTH_MISMATCH");
    }

    const validation = validateWavPcm16(bytes, "audio/wav");

    if (!validation.ok) {
      throw new Error("REPLAY_WAV_INVALID");
    }

    return {
      mediaId: input.mediaId,
      byteLength: validation.metadata.byteLength,
      durationSeconds: validation.metadata.durationSeconds,
      replayed: true,
    };
  } catch {
    // Never return 200 for unreadable or corrupted evidence.
    throw new EvidenceServiceError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
  }
}

/**
 * AB-WC-010 — Idempotent private audio upload orchestration.
 *
 * This is the authenticated service layer, not an HTTP handler.
 * Caller-provided user IDs are not accepted.
 */
export async function uploadAudioIdempotently(
  input: UploadInput,
): Promise<UploadResult> {
  if (!isUuid(input.organizationId) || !isUuid(input.observationId)) {
    throw new EvidenceServiceError(400, "INVALID_EVIDENCE_TARGET");
  }

  const parsedKey = parseIdempotencyKey(input.idempotencyKey);

  if (!parsedKey.ok) {
    throw new EvidenceServiceError(400, parsedKey.error);
  }

  // Derive the uploader from the signed session.
  // Includes current account, role, organization, and MFA checks.
  const access = await checkOperationalAccess(input.organizationId, "operator");

  if (!access.allowed) {
    throw new EvidenceServiceError(access.status, access.reason);
  }

  const observation = await getScopedObservation(
    input.organizationId,
    input.observationId,
  );

  if (!observation) {
    throw new EvidenceServiceError(404, "OBSERVATION_NOT_FOUND");
  }

  if (observation.domain !== "biodiversity") {
    throw new EvidenceServiceError(
      422,
      "AUDIO_REQUIRES_BIODIVERSITY_OBSERVATION",
    );
  }

  // Validate before claiming a persistent reservation.
  // Invalid WAV uploads must not create processing rows.
  const validated = validateWavPcm16(input.bytes, input.declaredMimeType);

  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const fingerprint = createAudioUploadFingerprint(input);

  const reservation = await reserveAudioUpload({
    organizationId: input.organizationId,
    observationId: input.observationId,
    userId: access.userId,
    idempotencyKey: parsedKey.value,
    requestSha256: fingerprint.requestSha256,
  });

  if (reservation.kind === "conflict") {
    throw new EvidenceServiceError(409, "IDEMPOTENCY_KEY_CONFLICT");
  }

  if (reservation.kind === "processing") {
    throw new EvidenceServiceError(409, "AUDIO_UPLOAD_IN_PROGRESS");
  }

  if (reservation.kind === "reconciliation_required") {
    throw new EvidenceServiceError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
  }

  if (reservation.kind === "completed") {
    return readVerifiedReplay({
      organizationId: input.organizationId,
      observationId: input.observationId,
      userId: access.userId,
      mediaId: reservation.mediaId,
      expectedSha256: fingerprint.fileSha256,
      expectedByteLength: fingerprint.byteLength,
    });
  }

  // Only the processor that acquired the reservation
  // may reach the private storage write.
  const stored = await savePrivateWav(input.bytes, input.declaredMimeType);

  // Refuse to complete if stored bytes are inconsistent
  // with the content fingerprint used for reservation.
  if (
    stored.sha256 !== fingerprint.fileSha256 ||
    stored.byteLength !== fingerprint.byteLength ||
    stored.mimeType !== fingerprint.mimeType
  ) {
    throw new EvidenceServiceError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
  }

  try {
    const completed = await completeReservedAudioUpload({
      organizationId: input.organizationId,
      observationId: input.observationId,
      userId: access.userId,
      reservationId: reservation.reservationId,
      leaseToken: reservation.leaseToken,
      requestSha256: fingerprint.requestSha256,
      stored: {
        storageKey: stored.storageKey,
        sha256: stored.sha256,
        mimeType: stored.mimeType,
        byteLength: stored.byteLength,
      },
    });

    return {
      mediaId: completed.mediaId,
      byteLength: stored.byteLength,
      durationSeconds: stored.durationSeconds,
      replayed: false,
    };
  } catch {
    // A connection may fail after PostgreSQL has committed.
    // Never delete a file unless a successful DB read
    // confirms no media row references this storage key.
    try {
      const db = getDb();

      const [existingMedia] = await db
        .select({ id: evidenceMedia.id })
        .from(evidenceMedia)
        .where(
          and(
            eq(evidenceMedia.organizationId, input.organizationId),
            eq(evidenceMedia.storageKey, stored.storageKey),
          ),
        )
        .limit(1);

      if (!existingMedia) {
        await deletePrivateWav(stored.storageKey, stored.sha256);
      }
    } catch {
      // Preserve the private file when DB state
      // or cleanup cannot be established.
    }

    // Preserve the reservation for explicit reconciliation.
    // Do not automatically steal its lease or retry writing.
    throw new EvidenceServiceError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
  }
}
