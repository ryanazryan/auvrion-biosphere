import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/server/db";
import {
  evidenceMedia,
  evidenceUploadRequests,
} from "@/server/db/operations-domain-schema";
import { isUuid } from "@/server/observations/observation-input";
import { inspectPrivateAudioInventory } from "./private-storage";

const ORPHAN_REVIEW_AGE_MS = 10 * 60 * 1000;

/**
 * Internal maintenance operation.
 *
 * Run only from a trusted maintenance process.
 * Never expose directly through a public API.
 *
 * Expired processing reservations cannot have
 * committed media through the fenced completion
 * transaction while remaining in processing state.
 *
 * We mark them failed, preserve private files, and
 * require explicit recovery decisions for retries.
 */

export async function reconcileExpiredAudioReservations(
  organizationId: string,
): Promise<{ transitionedToFailed: number }> {
  if (!isUuid(organizationId)) {
    throw new Error("INVALID_RECONCILIATION_ORGANIZATION");
  }

  const changed = await getDb()
    .update(evidenceUploadRequests)
    .set({
      status: "failed",
      leaseToken: null,
      leaseExpiresAt: null,
      mediaId: null,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(
      and(
        eq(evidenceUploadRequests.organizationId, organizationId),
        eq(evidenceUploadRequests.status, "processing"),
        sql`
          ${evidenceUploadRequests.leaseExpiresAt}
          <= clock_timestamp()
        `,
      ),
    )
    .returning({
      id: evidenceUploadRequests.id,
    });

  return {
    transitionedToFailed: changed.length,
  };
}

/**
 * Read-only inventory reconciliation.
 *
 * Reports counts only.
 * Does not expose private paths or storage keys
 * to the caller and never removes evidence.
 *
 * Candidate files are not automatically safe
 * to delete, even when old or unreferenced.
 */
export async function inspectAudioReconciliation(): Promise<{
  referencedAudio: number;
  missingAvailableFiles: number;
  unreferencedPublishedCandidates: number;
  stagingCandidates: number;
}> {
  const db = getDb();

  const [mediaRows, inventory] = await Promise.all([
    db
      .select({
        storageKey: evidenceMedia.storageKey,
        availability: evidenceMedia.availability,
      })
      .from(evidenceMedia)
      .where(eq(evidenceMedia.mimeType, "audio/wav")),

    inspectPrivateAudioInventory(),
  ]);

  const referenced = new Set(mediaRows.map((row) => row.storageKey));

  const published = new Set(
    inventory
      .filter((entry) => entry.kind === "published")
      .map((entry) => entry.name),
  );

  const cutoff = Date.now() - ORPHAN_REVIEW_AGE_MS;

  const missingAvailableFiles = mediaRows.filter(
    (row) => row.availability === "available" && !published.has(row.storageKey),
  ).length;

  const unreferencedPublishedCandidates = inventory.filter(
    (entry) =>
      entry.kind === "published" &&
      entry.modifiedAtMs <= cutoff &&
      !referenced.has(entry.name),
  ).length;

  const stagingCandidates = inventory.filter(
    (entry) => entry.kind === "staging" && entry.modifiedAtMs <= cutoff,
  ).length;

  return {
    referencedAudio: mediaRows.length,
    missingAvailableFiles,
    unreferencedPublishedCandidates,
    stagingCandidates,
  };
}
