import "server-only";

import { and, eq } from "drizzle-orm";

import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import {
  evidenceLinks,
  evidenceMedia,
  evidenceUploadRequests,
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
  failReservedAudioUpload,
  reserveAudioUpload,
} from "./upload-reservation-service";
import { validateWavPcm16 } from "./wav-validation";

// ============================================================
// AB-WC-010 — Types
// ============================================================

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

// ============================================================
// 1. Verified Replay
// ============================================================

/**
 * Verify previously completed evidence before returning a
 * successful idempotent replay.
 *
 * A completed reservation alone is not sufficient proof
 * that the underlying private file remains available.
 *
 * Verify:
 * - media belongs to the authorized organization,
 * - media links to the intended observation,
 * - media was created by the authenticated uploader,
 * - media is available,
 * - MIME and expected metadata match,
 * - private WAV is readable,
 * - SHA-256 matches,
 * - byte length and WAV structure are valid.
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
    /**
     * Never return HTTP 200 when:
     * - media metadata is missing,
     * - the observation link is invalid,
     * - the private file is missing,
     * - the file's SHA-256 differs,
     * - the WAV structure is invalid.
     *
     * Do not expose internal details.
     */
    throw new EvidenceServiceError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
  }
}

// ============================================================
// 2. Idempotent Audio Upload Orchestration
// ============================================================

/**
 * AB-WC-010 — Idempotent private audio upload.
 *
 * Responsibilities:
 * 1. Validate organization and observation IDs.
 * 2. Validate the idempotency key.
 * 3. Resolve authenticated operator and MFA assurance.
 * 4. Enforce observation organization and domain.
 * 5. Validate WAV before acquiring a reservation.
 * 6. Generate a canonical upload fingerprint.
 * 7. Acquire/read PostgreSQL reservation.
 * 8. Verify previously completed evidence on replay.
 * 9. Save a new private WAV for newly acquired uploads.
 * 10. Atomically complete media, link, and reservation.
 * 11. Handle storage failure and uncertain commit outcomes.
 *
 * Never accept client-supplied user IDs.
 */
export async function uploadAudioIdempotently(
  input: UploadInput,
): Promise<UploadResult> {
  // ----------------------------------------------------------
  // A. Validate target identifiers
  // ----------------------------------------------------------

  if (!isUuid(input.organizationId) || !isUuid(input.observationId)) {
    throw new EvidenceServiceError(400, "INVALID_EVIDENCE_TARGET");
  }

  // ----------------------------------------------------------
  // B. Validate idempotency key
  // ----------------------------------------------------------

  const parsedKey = parseIdempotencyKey(input.idempotencyKey);

  if (!parsedKey.ok) {
    throw new EvidenceServiceError(400, parsedKey.error);
  }

  // ----------------------------------------------------------
  // C. Reauthorize authenticated operator
  // ----------------------------------------------------------

  /**
   * Authorization happens independently inside the
   * service even though the HTTP route already checks it.
   *
   * This prevents unauthorized use by other server callers.
   */
  const access = await checkOperationalAccess(input.organizationId, "operator");

  if (!access.allowed) {
    throw new EvidenceServiceError(access.status, access.reason);
  }

  // ----------------------------------------------------------
  // D. Verify observation scope and supported domain
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // E. Validate WAV before creating a reservation
  // ----------------------------------------------------------

  const validated = validateWavPcm16(input.bytes, input.declaredMimeType);

  if (!validated.ok) {
    throw new Error(validated.error);
  }

  // ----------------------------------------------------------
  // F. Generate canonical upload fingerprint
  // ----------------------------------------------------------

  const fingerprint = createAudioUploadFingerprint(input);

  // ----------------------------------------------------------
  // G. Acquire or inspect PostgreSQL reservation
  // ----------------------------------------------------------

  const reservation = await reserveAudioUpload({
    organizationId: input.organizationId,
    observationId: input.observationId,
    userId: access.userId,
    idempotencyKey: parsedKey.value,
    requestSha256: fingerprint.requestSha256,
  });

  // Same key, different request fingerprint.
  if (reservation.kind === "conflict") {
    throw new EvidenceServiceError(409, "IDEMPOTENCY_KEY_CONFLICT");
  }

  // Another request currently owns this upload.
  if (reservation.kind === "processing") {
    throw new EvidenceServiceError(409, "AUDIO_UPLOAD_IN_PROGRESS");
  }

  // Expired or failed reservation requires reconciliation.
  if (reservation.kind === "reconciliation_required") {
    throw new EvidenceServiceError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
  }

  // ----------------------------------------------------------
  // H. Verified replay of previously completed upload
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // I. Newly acquired reservation
  // ----------------------------------------------------------

  /**
   * Only this reservation's active lease token may
   * complete the upload.
   */
  const owner = {
    organizationId: input.organizationId,
    observationId: input.observationId,
    userId: access.userId,
    reservationId: reservation.reservationId,
    leaseToken: reservation.leaseToken,
    requestSha256: fingerprint.requestSha256,
  };

  // ----------------------------------------------------------
  // J. Save private WAV
  // ----------------------------------------------------------

  /**
   * savePrivateWav:
   * - validates WAV again,
   * - creates an exclusive staging file,
   * - flushes bytes,
   * - atomically renames to a private storage key.
   *
   * No media/link completion has been attempted yet.
   */
  const stored = await savePrivateWav(
    input.bytes,
    input.declaredMimeType,
  ).catch(async () => {
    /**
     * Only the active reservation owner can transition
     * the reservation to failed.
     *
     * If the transition fails, preserve the existing
     * reservation state for reconciliation.
     */
    await failReservedAudioUpload(owner).catch(() => false);

    throw new EvidenceServiceError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
  });

  // ----------------------------------------------------------
  // K. Validate stored file metadata
  // ----------------------------------------------------------

  /**
   * Refuse database completion if the stored metadata
   * differs from the original fingerprint.
   */
  if (
    stored.sha256 !== fingerprint.fileSha256 ||
    stored.byteLength !== fingerprint.byteLength ||
    stored.mimeType !== fingerprint.mimeType
  ) {
    let removed = false;

    try {
      /**
       * deletePrivateWav independently verifies the file
       * SHA-256 before deleting it.
       */
      await deletePrivateWav(stored.storageKey, stored.sha256);

      removed = true;
    } catch {
      /**
       * Keep the reservation for reconciliation when
       * cleanup cannot safely finish.
       */
    }

    if (removed) {
      await failReservedAudioUpload(owner).catch(() => false);
    }

    throw new EvidenceServiceError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
  }

  // ----------------------------------------------------------
  // L. Atomic PostgreSQL completion
  // ----------------------------------------------------------

  try {
    /**
     * This service uses a database transaction to:
     * - create evidence_media,
     * - create evidence_links,
     * - complete the reservation using lease fencing.
     */
    const completed = await completeReservedAudioUpload({
      ...owner,
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
  } catch (error) {
    // --------------------------------------------------------
    // M. Explicit lease-fencing rejection
    // --------------------------------------------------------

    /**
     * The completion transaction explicitly rolled back
     * when UPLOAD_RESERVATION_FENCE_REJECTED was raised.
     *
     * The file is owned by this upload attempt.
     *
     * Attempt cleanup, but never assume that cleanup
     * succeeded if deletion throws.
     */
    if (
      error instanceof Error &&
      error.message === "UPLOAD_RESERVATION_FENCE_REJECTED"
    ) {
      await deletePrivateWav(stored.storageKey, stored.sha256).catch(() => {
        // File cleanup requires later reconciliation.
      });

      throw new EvidenceServiceError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
    }

    // --------------------------------------------------------
    // N. Ambiguous PostgreSQL commit outcome
    // --------------------------------------------------------

    /**
     * A lost database connection can make a successful
     * COMMIT appear to have failed.
     *
     * Never delete the private WAV merely because the
     * completion function threw an error.
     *
     * Instead, check the reservation's persisted state.
     */
    try {
      const [state] = await getDb()
        .select({
          status: evidenceUploadRequests.status,
          mediaId: evidenceUploadRequests.mediaId,
        })
        .from(evidenceUploadRequests)
        .where(
          and(
            eq(evidenceUploadRequests.id, reservation.reservationId),
            eq(evidenceUploadRequests.organizationId, input.organizationId),
            eq(evidenceUploadRequests.observationId, input.observationId),
            eq(evidenceUploadRequests.userId, access.userId),
            eq(evidenceUploadRequests.requestSha256, fingerprint.requestSha256),
          ),
        )
        .limit(1);

      if (state?.status === "completed" && state.mediaId) {
        /**
         * PostgreSQL indicates the upload committed.
         *
         * Verify:
         * - media metadata,
         * - observation linkage,
         * - creator identity,
         * - private file SHA-256,
         * - WAV format and length.
         */
        const verified = await readVerifiedReplay({
          organizationId: input.organizationId,
          observationId: input.observationId,
          userId: access.userId,
          mediaId: state.mediaId,
          expectedSha256: fingerprint.fileSha256,
          expectedByteLength: fingerprint.byteLength,
        });

        /**
         * The request originally acquired this
         * reservation and has now confirmed completion.
         *
         * Return 201 for the recovered first upload.
         */
        return {
          ...verified,
          replayed: false,
        };
      }
    } catch {
      /**
       * Database state or media integrity cannot be
       * confirmed.
       *
       * Preserve the private file.
       */
    }

    // --------------------------------------------------------
    // O. Unknown outcome — fail closed
    // --------------------------------------------------------

    /**
     * Do not:
     * - delete a potentially committed WAV,
     * - overwrite the reservation,
     * - automatically steal an expired lease,
     * - fabricate a successful response.
     *
     * Keep file and reservation state for reconciliation.
     */
    throw new EvidenceServiceError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
  }
}
