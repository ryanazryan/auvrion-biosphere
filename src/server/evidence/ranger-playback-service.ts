import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import {
  caseObservationLinks,
  observations,
} from "@/server/db/observation-domain-schema";
import { ingestionRecordings } from "@/server/db/wc017-device-recordings-schema";
import { isTaskUuid } from "@/server/ranger/ranger-task-query";
import { getMyRangerTask } from "@/server/ranger/ranger-task-service";
import { readPrivateWav } from "./private-storage";
import { MAX_AUDIO_BYTES, validateWavPcm16 } from "./wav-validation";

export class RangerAudioError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 503,
    public readonly reason: string,
  ) {
    super(reason);
  }
}

/** Read a private WC017 device WAV only when attached to a Case actively assigned
 * to this authenticated Ranger in the same organization. Never expose storage keys.
 */
export async function readAuthorizedRangerTaskWav(input: {
  organizationId: string;
  taskId: string;
  observationId: string;
  mediaId: string;
}): Promise<Buffer> {
  if (Object.values(input).some((id) => !isTaskUuid(id))) {
    throw new RangerAudioError(400, "INVALID_RANGER_AUDIO_TARGET");
  }
  const access = await checkOperationalAccess(input.organizationId, "ranger");
  if (!access.allowed) throw new RangerAudioError(access.status, access.reason);
  const task = await getMyRangerTask(
    input.organizationId,
    access.userId,
    input.taskId,
  );
  if (!task || task.status === "cancelled") {
    throw new RangerAudioError(404, "TASK_NOT_ASSIGNED");
  }
  const [record] = await getDb()
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
    .innerJoin(
      caseObservationLinks,
      and(
        eq(caseObservationLinks.observationId, observations.id),
        eq(caseObservationLinks.organizationId, observations.organizationId),
      ),
    )
    .where(
      and(
        eq(ingestionRecordings.id, input.mediaId),
        eq(ingestionRecordings.organizationId, input.organizationId),
        eq(ingestionRecordings.observationId, input.observationId),
        eq(caseObservationLinks.caseId, task.caseId),
        isNull(caseObservationLinks.unlinkedAt),
        eq(observations.domain, "biodiversity"),
      ),
    )
    .limit(1);
  if (!record) throw new RangerAudioError(404, "AUDIO_NOT_FOUND");
  if (
    !/^[0-9a-f]{64}$/.test(record.sha256) ||
    record.byteLength < 44 ||
    record.byteLength > MAX_AUDIO_BYTES
  ) {
    throw new RangerAudioError(503, "AUDIO_INTEGRITY_UNAVAILABLE");
  }
  try {
    const bytes = await readPrivateWav(record.storageKey, record.sha256);
    if (bytes.byteLength !== record.byteLength)
      throw new Error("BYTE_LENGTH_MISMATCH");
    const validated = validateWavPcm16(bytes, "audio/wav");
    if (!validated.ok) throw new Error("INVALID_WAV");
    return bytes;
  } catch (error) {
  if (process.env.NODE_ENV === "development") {
    console.error("[RANGER_AUDIO_INTEGRITY]", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  throw new RangerAudioError(503, "AUDIO_INTEGRITY_UNAVAILABLE");
}
}
