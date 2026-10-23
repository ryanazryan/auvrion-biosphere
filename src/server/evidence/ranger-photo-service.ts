import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import { userAccess } from "@/server/db/access-schema";
import { roleGrants } from "@/server/db/grants-schema";
import {
  domainTasks,
  evidenceLinks,
  evidenceMedia,
  taskAssignments,
  taskFindings,
} from "@/server/db/operations-domain-schema";
import { getMyRangerTask } from "@/server/ranger/ranger-task-service";
import { isTaskWorkflowUuid } from "@/server/workflow/approved-task-policy";
import {
  MAX_RANGER_PHOTOS_PER_FINDING,
  readRangerPhoto,
  removeOrphanRangerPhoto,
  storeRangerPhoto,
} from "./private-ranger-photo";

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

export class RangerPhotoFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

function validIds(...ids: string[]) {
  if (ids.some((id) => !isTaskWorkflowUuid(id)))
    throw new RangerPhotoFailure(400, "INVALID_PHOTO_TARGET");
}

/** Verify current-session MFA, active account, org scope and task visibility. */
async function taskReader(organizationId: string, taskId: string) {
  validIds(organizationId, taskId);
  const ranger = await checkOperationalAccess(organizationId, "ranger");
  if (ranger.allowed) {
    const task = await getMyRangerTask(organizationId, ranger.userId, taskId);
    if (task) return { role: "ranger" as const, userId: ranger.userId };
  }
  const supervisor = await checkOperationalAccess(organizationId, "supervisor");
  if (!supervisor.allowed) {
    throw new RangerPhotoFailure(supervisor.status, supervisor.reason);
  }
  const [task] = await getDb()
    .select({ id: domainTasks.id })
    .from(domainTasks)
    .where(
      and(
        eq(domainTasks.id, taskId),
        eq(domainTasks.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!task) throw new RangerPhotoFailure(404, "TASK_NOT_FOUND");
  return { role: "supervisor" as const, userId: supervisor.userId };
}

async function photoRows(
  organizationId: string,
  taskId: string,
  mediaId?: string,
) {
  return getDb()
    .select({
      mediaId: evidenceMedia.id,
      findingId: taskFindings.id,
      uploadedAt: evidenceMedia.createdAt,
      sha256: evidenceMedia.sha256,
      storageKey: evidenceMedia.storageKey,
      mimeType: evidenceMedia.mimeType,
      byteLength: evidenceMedia.byteLength,
    })
    .from(evidenceLinks)
    .innerJoin(
      evidenceMedia,
      and(
        eq(evidenceLinks.mediaId, evidenceMedia.id),
        eq(evidenceLinks.organizationId, evidenceMedia.organizationId),
      ),
    )
    .innerJoin(
      taskFindings,
      and(
        eq(evidenceLinks.findingId, taskFindings.id),
        eq(evidenceLinks.organizationId, taskFindings.organizationId),
      ),
    )
    .where(
      and(
        eq(taskFindings.organizationId, organizationId),
        eq(taskFindings.taskId, taskId),
        eq(evidenceLinks.organizationId, organizationId),
        eq(evidenceMedia.availability, "available"),
        inArray(evidenceMedia.mimeType, [...IMAGE_MIMES]),
        mediaId ? eq(evidenceMedia.id, mediaId) : undefined,
      ),
    )
    .orderBy(desc(evidenceMedia.createdAt), desc(evidenceMedia.id))
    .limit(mediaId ? 1 : 100);
}

export async function listAuthorizedTaskPhotos(
  organizationId: string,
  taskId: string,
) {
  await taskReader(organizationId, taskId);
  const rows = await photoRows(organizationId, taskId);
  return rows.map((row) => ({
    mediaId: row.mediaId,
    findingId: row.findingId,
    uploadedAt: row.uploadedAt.toISOString(),
    mimeType: row.mimeType,
  }));
}

export async function readAuthorizedTaskPhoto(
  organizationId: string,
  taskId: string,
  mediaId: string,
) {
  validIds(organizationId, taskId, mediaId);
  await taskReader(organizationId, taskId);
  const [row] = await photoRows(organizationId, taskId, mediaId);
  if (!row?.sha256 || !row.mimeType)
    throw new RangerPhotoFailure(404, "PHOTO_NOT_FOUND");
  try {
    const bytes = await readRangerPhoto(
      row.storageKey,
      row.sha256,
      row.mimeType,
    );
    return { bytes, mimeType: row.mimeType };
  } catch {
    throw new RangerPhotoFailure(503, "PHOTO_INTEGRITY_OR_STORAGE_UNAVAILABLE");
  }
}

/** Photo can only attach to a Ranger's own existing finding while Task is in progress. */
export async function attachRangerFindingPhoto(input: {
  organizationId: string;
  taskId: string;
  findingId: string;
  bytes: Uint8Array;
  mimeType: string;
}) {
  validIds(input.organizationId, input.taskId, input.findingId);
  const access = await checkOperationalAccess(input.organizationId, "ranger");
  if (!access.allowed)
    throw new RangerPhotoFailure(access.status, access.reason);
  const visible = await getMyRangerTask(
    input.organizationId,
    access.userId,
    input.taskId,
  );
  if (!visible) throw new RangerPhotoFailure(404, "TASK_NOT_FOUND");
  if (visible.status !== "in_progress")
    throw new RangerPhotoFailure(409, "TASK_NOT_IN_PROGRESS");
  const [ownedFinding] = await getDb()
    .select({ id: taskFindings.id })
    .from(taskFindings)
    .where(
      and(
        eq(taskFindings.organizationId, input.organizationId),
        eq(taskFindings.taskId, input.taskId),
        eq(taskFindings.id, input.findingId),
        eq(taskFindings.authorUserId, access.userId),
      ),
    )
    .limit(1);
  if (!ownedFinding) throw new RangerPhotoFailure(404, "FINDING_NOT_FOUND");

  // Validate and atomically publish private file before linking DB metadata.
  let stored: Awaited<ReturnType<typeof storeRangerPhoto>>;
  try {
    stored = await storeRangerPhoto(input.bytes, input.mimeType);
  } catch (error) {
    if (
      error instanceof Error &&
      ["INVALID_PHOTO_LENGTH", "INVALID_PHOTO_FORMAT"].includes(error.message)
    ) {
      throw new RangerPhotoFailure(422, error.message);
    }
    throw new RangerPhotoFailure(503, "PHOTO_PRIVATE_STORAGE_UNAVAILABLE");
  }
  const db = getDb();
  try {
    const result = await db.transaction(async (tx) => {
      // Lock Task to serialize uploads and status transitions; recheck auth under locks.
      const [task] = await tx
        .select({ status: domainTasks.status })
        .from(domainTasks)
        .where(
          and(
            eq(domainTasks.id, input.taskId),
            eq(domainTasks.organizationId, input.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      const [account] = await tx
        .select({ status: userAccess.status })
        .from(userAccess)
        .where(eq(userAccess.userId, access.userId))
        .for("share")
        .limit(1);
      const [grant] = await tx
        .select({ id: roleGrants.id })
        .from(roleGrants)
        .where(
          and(
            eq(roleGrants.userId, access.userId),
            eq(roleGrants.organizationId, input.organizationId),
            eq(roleGrants.role, "ranger"),
            isNull(roleGrants.revokedAt),
          ),
        )
        .for("share")
        .limit(1);
      const [assignment] = await tx
        .select({ id: taskAssignments.id })
        .from(taskAssignments)
        .where(
          and(
            eq(taskAssignments.taskId, input.taskId),
            eq(taskAssignments.organizationId, input.organizationId),
            eq(taskAssignments.rangerUserId, access.userId),
            isNull(taskAssignments.unassignedAt),
          ),
        )
        .for("share")
        .limit(1);
      if (account?.status !== "active" || !grant || !assignment) {
        throw new RangerPhotoFailure(403, "RANGER_ACCESS_REVOKED");
      }
      if (task?.status !== "in_progress")
        throw new RangerPhotoFailure(409, "TASK_NOT_IN_PROGRESS");
      const [finding] = await tx
        .select({ id: taskFindings.id })
        .from(taskFindings)
        .where(
          and(
            eq(taskFindings.id, input.findingId),
            eq(taskFindings.taskId, input.taskId),
            eq(taskFindings.organizationId, input.organizationId),
            eq(taskFindings.authorUserId, access.userId),
          ),
        )
        .limit(1);
      if (!finding) throw new RangerPhotoFailure(404, "FINDING_NOT_FOUND");
      const existing = await tx
        .select({
          mediaId: evidenceMedia.id,
          digest: evidenceMedia.sha256,
        })
        .from(evidenceLinks)
        .innerJoin(
          evidenceMedia,
          and(
            eq(evidenceLinks.mediaId, evidenceMedia.id),
            eq(evidenceLinks.organizationId, evidenceMedia.organizationId),
          ),
        )
        .where(
          and(
            eq(evidenceLinks.findingId, finding.id),
            eq(evidenceLinks.organizationId, input.organizationId),
            inArray(evidenceMedia.mimeType, [...IMAGE_MIMES]),
          ),
        )
        .limit(MAX_RANGER_PHOTOS_PER_FINDING);
      const duplicate = existing.find(
        (entry) => entry.digest === stored.sha256,
      );
      if (duplicate) return { mediaId: duplicate.mediaId, replayed: true };
      if (existing.length >= MAX_RANGER_PHOTOS_PER_FINDING) {
        throw new RangerPhotoFailure(422, "MAX_FINDING_PHOTOS_REACHED");
      }
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
      if (!media)
        throw new RangerPhotoFailure(500, "PHOTO_METADATA_WRITE_FAILED");
      await tx.insert(evidenceLinks).values({
        organizationId: input.organizationId,
        mediaId: media.id,
        findingId: finding.id,
        linkedByUserId: access.userId,
      });
      return { mediaId: media.id, replayed: false };
    });
    if (result.replayed) {
      await removeOrphanRangerPhoto(
        stored.storageKey,
        stored.sha256,
        stored.mimeType,
      ).catch(() => {});
    }
    return result;
  } catch (error) {
    // Never delete on an uncertain commit; check whether metadata was committed first.
    try {
      const [linked] = await db
        .select({ id: evidenceMedia.id })
        .from(evidenceMedia)
        .where(
          and(
            eq(evidenceMedia.organizationId, input.organizationId),
            eq(evidenceMedia.storageKey, stored.storageKey),
          ),
        )
        .limit(1);
      if (!linked)
        await removeOrphanRangerPhoto(
          stored.storageKey,
          stored.sha256,
          stored.mimeType,
        );
    } catch {
      throw new RangerPhotoFailure(503, "PHOTO_RECONCILIATION_REQUIRED");
    }
    if (error instanceof RangerPhotoFailure) throw error;
    throw new RangerPhotoFailure(500, "PHOTO_PERSISTENCE_FAILED");
  }
}
