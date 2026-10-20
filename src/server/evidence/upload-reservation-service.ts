import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/server/db";
import {
  evidenceLinks,
  evidenceMedia,
  evidenceUploadRequests,
} from "@/server/db/operations-domain-schema";
import { isUuid } from "@/server/observations/observation-input";
import { parseIdempotencyKey } from "./upload-idempotency";
import { MAX_AUDIO_BYTES } from "./wav-validation";

// ============================================================
// AB-WC-010 — Upload Reservation Types
// ============================================================

type ReserveInput = {
  organizationId: string;
  observationId: string;

  /**
   * Must be derived from authenticated server-side access.
   * Never trust a userId supplied in the HTTP request body.
   */
  userId: string;

  idempotencyKey: string;
  requestSha256: string;
};

type ReservationResult =
  | {
      kind: "acquired";
      reservationId: string;
      leaseToken: string;
    }
  | {
      kind: "processing";
    }
  | {
      kind: "conflict";
    }
  | {
      kind: "completed";
      mediaId: string;
    }
  | {
      kind: "reconciliation_required";
    };

type CompleteUploadInput = {
  organizationId: string;
  observationId: string;
  userId: string;

  reservationId: string;
  leaseToken: string;
  requestSha256: string;

  stored: {
    storageKey: string;
    sha256: string;
    mimeType: "audio/wav";
    byteLength: number;
  };
};

type FailUploadInput = Omit<CompleteUploadInput, "stored">;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

// ============================================================
// 1. Reserve Audio Upload
// ============================================================

/**
 * Create a durable PostgreSQL reservation for a logical upload.
 *
 * Unique constraint:
 * (organization_id, user_id, idempotency_key)
 *
 * The database, not an in-memory JavaScript lock, arbitrates
 * concurrent requests.
 *
 * Expired leases are never automatically stolen.
 */
export async function reserveAudioUpload(
  input: ReserveInput,
): Promise<ReservationResult> {
  const parsedKey = parseIdempotencyKey(input.idempotencyKey);

  if (
    !isUuid(input.organizationId) ||
    !isUuid(input.observationId) ||
    !input.userId.trim() ||
    !parsedKey.ok ||
    !SHA256_PATTERN.test(input.requestSha256)
  ) {
    throw new Error("INVALID_AUDIO_RESERVATION_INPUT");
  }

  const db = getDb();
  const leaseToken = randomUUID();

  /**
   * PostgreSQL's unique constraint ensures that only
   * one request can acquire a reservation for this key.
   */
  const [created] = await db
    .insert(evidenceUploadRequests)
    .values({
      organizationId: input.organizationId,
      observationId: input.observationId,
      userId: input.userId,
      idempotencyKey: parsedKey.value,
      requestSha256: input.requestSha256,
      status: "processing",
      leaseToken,
      leaseExpiresAt: sql`now() + interval '2 minutes'`,
      attempt: 1,
    })
    .onConflictDoNothing({
      target: [
        evidenceUploadRequests.organizationId,
        evidenceUploadRequests.userId,
        evidenceUploadRequests.idempotencyKey,
      ],
    })
    .returning({
      id: evidenceUploadRequests.id,
    });

  if (created) {
    return {
      kind: "acquired",
      reservationId: created.id,
      leaseToken,
    };
  }

  /**
   * Another request already owns or previously used
   * this idempotency key.
   *
   * Read the existing reservation instead of creating
   * a new one.
   */
  const [existing] = await db
    .select({
      id: evidenceUploadRequests.id,
      observationId: evidenceUploadRequests.observationId,
      requestSha256: evidenceUploadRequests.requestSha256,
      status: evidenceUploadRequests.status,
      mediaId: evidenceUploadRequests.mediaId,

      leaseActive: sql<boolean>`
        ${evidenceUploadRequests.leaseExpiresAt} > now()
      `,
    })
    .from(evidenceUploadRequests)
    .where(
      and(
        eq(evidenceUploadRequests.organizationId, input.organizationId),
        eq(evidenceUploadRequests.userId, input.userId),
        eq(evidenceUploadRequests.idempotencyKey, parsedKey.value),
      ),
    )
    .limit(1);

  /**
   * A concurrently deleted or otherwise unavailable
   * reservation must not be treated as a new upload.
   */
  if (!existing) {
    return {
      kind: "reconciliation_required",
    };
  }

  /**
   * Same idempotency key but different target or content.
   */
  if (
    existing.observationId !== input.observationId ||
    existing.requestSha256 !== input.requestSha256
  ) {
    return {
      kind: "conflict",
    };
  }

  /**
   * Previously completed upload.
   *
   * The caller MUST independently:
   * - verify authorization,
   * - validate media availability,
   * - validate observation linkage,
   * - verify private file integrity.
   */
  if (existing.status === "completed") {
    if (!existing.mediaId) {
      return {
        kind: "reconciliation_required",
      };
    }

    return {
      kind: "completed",
      mediaId: existing.mediaId,
    };
  }

  /**
   * An active processor still owns the reservation.
   */
  if (existing.status === "processing") {
    if (existing.leaseActive) {
      return {
        kind: "processing",
      };
    }

    /**
     * Expired processing leases require reconciliation.
     *
     * Never automatically acquire a new lease while
     * the previous upload's filesystem or DB state
     * may be uncertain.
     */
    return {
      kind: "reconciliation_required",
    };
  }

  /**
   * Failed reservations require an explicit recovery
   * decision before the key can be reused.
   */
  return {
    kind: "reconciliation_required",
  };
}

// ============================================================
// 2. Complete Reserved Audio Upload
// ============================================================

/**
 * Atomically complete an upload reservation.
 *
 * Prerequisites:
 * - operator has been authenticated and authorized,
 * - observation belongs to the authorized organization,
 * - WAV has passed validation,
 * - file has been written to private storage,
 * - SHA-256 fingerprint has been calculated.
 *
 * One database transaction:
 * 1. Insert evidence_media.
 * 2. Insert evidence_links.
 * 3. Complete the owned upload reservation.
 *
 * A rejected fence causes the entire transaction
 * to roll back.
 */
export async function completeReservedAudioUpload(
  input: CompleteUploadInput,
): Promise<{ mediaId: string }> {
  const storageKeyIsUuid =
    input.stored.storageKey.endsWith(".wav") &&
    isUuid(input.stored.storageKey.slice(0, -4));

  if (
    !isUuid(input.organizationId) ||
    !isUuid(input.observationId) ||
    !isUuid(input.reservationId) ||
    !isUuid(input.leaseToken) ||
    !input.userId.trim() ||
    !SHA256_PATTERN.test(input.requestSha256) ||
    !SHA256_PATTERN.test(input.stored.sha256) ||
    !storageKeyIsUuid ||
    input.stored.mimeType !== "audio/wav" ||
    !Number.isSafeInteger(input.stored.byteLength) ||
    input.stored.byteLength <= 0 ||
    input.stored.byteLength > MAX_AUDIO_BYTES
  ) {
    throw new Error("INVALID_AUDIO_COMPLETION_INPUT");
  }

  const db = getDb();

  return db.transaction(async (tx) => {
    /**
     * Insert metadata for the WAV file already stored
     * in the private storage directory.
     */
    const [media] = await tx
      .insert(evidenceMedia)
      .values({
        organizationId: input.organizationId,
        storageKey: input.stored.storageKey,
        availability: "available",
        sha256: input.stored.sha256,
        mimeType: input.stored.mimeType,
        byteLength: input.stored.byteLength,
        createdByUserId: input.userId,
      })
      .returning({
        id: evidenceMedia.id,
      });

    if (!media) {
      throw new Error("EVIDENCE_MEDIA_INSERT_FAILED");
    }

    /**
     * Link the media to the intended observation.
     *
     * Foreign keys enforce same-organization references.
     */
    await tx.insert(evidenceLinks).values({
      organizationId: input.organizationId,
      observationId: input.observationId,
      mediaId: media.id,
      linkedByUserId: input.userId,
    });

    /**
     * Lease fencing.
     *
     * The reservation can be completed only if:
     * - its identity matches,
     * - its current status is processing,
     * - the lease token belongs to this processor,
     * - the lease has not expired.
     *
     * PostgreSQL serializes competing row updates.
     */
    const [completed] = await tx
      .update(evidenceUploadRequests)
      .set({
        status: "completed",
        mediaId: media.id,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(evidenceUploadRequests.id, input.reservationId),
          eq(evidenceUploadRequests.organizationId, input.organizationId),
          eq(evidenceUploadRequests.observationId, input.observationId),
          eq(evidenceUploadRequests.userId, input.userId),
          eq(evidenceUploadRequests.requestSha256, input.requestSha256),
          eq(evidenceUploadRequests.status, "processing"),
          eq(evidenceUploadRequests.leaseToken, input.leaseToken),
          sql`
            ${evidenceUploadRequests.leaseExpiresAt}
            > clock_timestamp()
          `,
        ),
      )
      .returning({
        id: evidenceUploadRequests.id,
      });

    if (!completed) {
      /**
       * Throwing inside the transaction rolls back:
       * - evidence_media insert,
       * - evidence_links insert,
       * - reservation changes.
       */
      throw new Error("UPLOAD_RESERVATION_FENCE_REJECTED");
    }

    return {
      mediaId: media.id,
    };
  });
}

// ============================================================
// 3. Fail Reserved Audio Upload
// ============================================================

/**
 * Mark a reservation as failed only when the current
 * processor still owns its active lease.
 *
 * Use only when the failure occurred BEFORE attempting
 * PostgreSQL evidence completion.
 *
 * Never call after an ambiguous database commit outcome.
 *
 * A failed reservation:
 * - has no committed media reference,
 * - has no active lease token,
 * - cannot be automatically acquired again,
 * - requires explicit reconciliation.
 *
 * Returns:
 * true  -> reservation transitioned to failed.
 * false -> reservation could not be changed, including
 *          wrong/expired lease or completed state.
 */
export async function failReservedAudioUpload(
  input: FailUploadInput,
): Promise<boolean> {
  if (
    !isUuid(input.organizationId) ||
    !isUuid(input.observationId) ||
    !isUuid(input.reservationId) ||
    !isUuid(input.leaseToken) ||
    !input.userId.trim() ||
    !SHA256_PATTERN.test(input.requestSha256)
  ) {
    throw new Error("INVALID_AUDIO_FAILURE_INPUT");
  }

  const db = getDb();

  const [failed] = await db
    .update(evidenceUploadRequests)
    .set({
      status: "failed",
      mediaId: null,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(evidenceUploadRequests.id, input.reservationId),
        eq(evidenceUploadRequests.organizationId, input.organizationId),
        eq(evidenceUploadRequests.observationId, input.observationId),
        eq(evidenceUploadRequests.userId, input.userId),
        eq(evidenceUploadRequests.requestSha256, input.requestSha256),
        eq(evidenceUploadRequests.status, "processing"),
        eq(evidenceUploadRequests.leaseToken, input.leaseToken),
        sql`
          ${evidenceUploadRequests.leaseExpiresAt}
          > clock_timestamp()
        `,
      ),
    )
    .returning({
      id: evidenceUploadRequests.id,
    });

  return Boolean(failed);
}
