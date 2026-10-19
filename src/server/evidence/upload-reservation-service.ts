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

type ReserveInput = {
  organizationId: string;
  observationId: string;
  // This must come from server-side authenticated access,
  // never directly from an HTTP request payload.
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
  | { kind: "processing" }
  | { kind: "conflict" }
  | { kind: "completed"; mediaId: string }
  | { kind: "reconciliation_required" };

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

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

  // PostgreSQL's unique constraint arbitrates concurrent
  // inserts. A losing request never owns the upload.
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
    .returning({ id: evidenceUploadRequests.id });

  if (created) {
    return {
      kind: "acquired",
      reservationId: created.id,
      leaseToken,
    };
  }

  // Read the existing committed reservation.
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

  // Could be concurrently deleted or otherwise unavailable.
  // Never interpret uncertainty as a new reservation.
  if (!existing) {
    return { kind: "reconciliation_required" };
  }

  if (
    existing.observationId !== input.observationId ||
    existing.requestSha256 !== input.requestSha256
  ) {
    return { kind: "conflict" };
  }

  if (existing.status === "completed") {
    if (!existing.mediaId) {
      return { kind: "reconciliation_required" };
    }

    // Caller MUST reauthorize and validate availability
    // and stored-file integrity before an HTTP replay.
    return {
      kind: "completed",
      mediaId: existing.mediaId,
    };
  }

  if (existing.status === "processing") {
    // Expired leases are NOT automatically stolen.
    // Filesystem/database reconciliation comes first.
    if (existing.leaseActive) {
      return { kind: "processing" };
    }

    return { kind: "reconciliation_required" };
  }

  // "failed" requires an explicit recovery decision.
  return { kind: "reconciliation_required" };
}

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

/**
 * Complete only a reservation still owned by this processor.
 *
 * The caller must have already:
 * - authorized the authenticated operator,
 * - validated the target observation,
 * - written the WAV to private storage,
 * - computed the request fingerprint from those bytes.
 *
 * Media, observation link and reservation completion
 * are persisted atomically.
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
      .returning({ id: evidenceMedia.id });

    if (!media) {
      throw new Error("EVIDENCE_MEDIA_INSERT_FAILED");
    }

    await tx.insert(evidenceLinks).values({
      organizationId: input.organizationId,
      observationId: input.observationId,
      mediaId: media.id,
      linkedByUserId: input.userId,
    });

    // The reservation may have expired or changed owners
    // while the file was being written.
    //
    // PostgreSQL serializes competing updates to this row.
    // Only the owner of a still-active processing lease wins.
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
          sql`${evidenceUploadRequests.leaseExpiresAt} > clock_timestamp()`,
        ),
      )
      .returning({ id: evidenceUploadRequests.id });

    if (!completed) {
      // This throws inside the transaction, rolling back
      // the evidence media and link inserts as well.
      throw new Error("UPLOAD_RESERVATION_FENCE_REJECTED");
    }

    return { mediaId: media.id };
  });
}
