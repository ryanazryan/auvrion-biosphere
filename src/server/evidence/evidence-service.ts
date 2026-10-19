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

import { deletePrivateWav, savePrivateWav } from "./private-storage";

type AttachAudioInput = {
  organizationId: string;
  observationId: string;
  bytes: Uint8Array;
  declaredMimeType: string;
};

export class EvidenceServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: string,
  ) {
    super(reason);
  }
}

export async function attachAudioToObservation(input: AttachAudioInput) {
  // Validate identifiers before database access.
  if (!isUuid(input.organizationId) || !isUuid(input.observationId)) {
    throw new EvidenceServiceError(400, "INVALID_EVIDENCE_TARGET");
  }

  // Resolve the actual authenticated user and current MFA assurance.
  // Never accept the uploader's user ID from client input.
  const access = await checkOperationalAccess(input.organizationId, "operator");

  if (!access.allowed) {
    throw new EvidenceServiceError(access.status, access.reason);
  }

  // Ensure the observation belongs to the authorized organization.
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

  const db = getDb();

  // File is validated and durably written before being made
  // available through the database.
  const stored = await savePrivateWav(input.bytes, input.declaredMimeType);

  try {
    const mediaId = await db.transaction(async (tx) => {
      const [media] = await tx
        .insert(evidenceMedia)
        .values({
          organizationId: input.organizationId,
          storageKey: stored.storageKey,
          availability: "available",
          sha256: stored.sha256,
          mimeType: stored.mimeType,
          byteLength: stored.byteLength,
          createdByUserId: access.userId,
        })
        .returning({ id: evidenceMedia.id });

      if (!media) {
        throw new Error("EVIDENCE_MEDIA_INSERT_FAILED");
      }

      // This link and the media row commit atomically.
      await tx.insert(evidenceLinks).values({
        organizationId: input.organizationId,
        mediaId: media.id,
        observationId: input.observationId,
        linkedByUserId: access.userId,
      });

      return media.id;
    });

    return {
      mediaId,
      storageKey: stored.storageKey,
      sha256: stored.sha256,
      byteLength: stored.byteLength,
      durationSeconds: stored.durationSeconds,
    };
  } catch {
    // A lost DB connection can make a successful COMMIT appear
    // to have failed. Never delete the file blindly.
    try {
      const existing = await db
        .select({ id: evidenceMedia.id })
        .from(evidenceMedia)
        .where(
          and(
            eq(evidenceMedia.organizationId, input.organizationId),
            eq(evidenceMedia.storageKey, stored.storageKey),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await deletePrivateWav(stored.storageKey, stored.sha256);
      }
    } catch {
      // Keep the private file for later reconciliation if
      // database state or cleanup cannot be established.
      throw new EvidenceServiceError(503, "EVIDENCE_RECONCILIATION_REQUIRED");
    }

    throw new EvidenceServiceError(500, "EVIDENCE_PERSISTENCE_FAILED");
  }
}
