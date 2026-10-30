import "server-only";

import { and, eq } from "drizzle-orm";
import { latestUnverifiedAnalysis } from "@/server/bioacoustics/analysis-handoff";
import { getDb } from "@/server/db";
import { ingestionRecordings } from "@/server/db/wc017-device-recordings-schema";
import { isUuid } from "@/server/observations/observation-input";
import {
  findWorkspaceAccess,
  getWorkspaceCase,
} from "@/server/workflow/workspace-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Origin",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};
const reply = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: HEADERS });

type Context = {
  params: Promise<{ caseId: string; observationId: string }>;
};

/** Read-only, authorized access to Operator's stored Perch candidates. */
export async function GET(_request: Request, context: Context) {
  const { caseId, observationId } = await context.params;
  if (!isUuid(caseId) || !isUuid(observationId)) {
    return reply({ error: "INVALID_TARGET" }, 400);
  }
  const access = await findWorkspaceAccess("supervisor");
  if (!access.allowed) {
    return reply({ error: access.reason }, access.status);
  }
  try {
    const detail = await getWorkspaceCase(access.organizationId, caseId);
    const observation = detail?.observations.find(
      (item) => item.id === observationId,
    );
    if (
      observation?.domain !== "biodiversity" ||
      observation.evidence?.sourceKind !== "listen_device"
    ) {
      return reply({ error: "CASE_OBSERVATION_NOT_FOUND" }, 404);
    }
    const snapshot = await latestUnverifiedAnalysis(
      access.organizationId,
      observationId,
    );
    if (!snapshot) return reply({ result: null });
    // Prevent stale or unrelated candidate results from reaching Supervisor.
    const [audio] = await getDb()
      .select({ sha256: ingestionRecordings.audioSha256 })
      .from(ingestionRecordings)
      .where(
        and(
          eq(ingestionRecordings.id, snapshot.mediaId),
          eq(ingestionRecordings.organizationId, access.organizationId),
          eq(ingestionRecordings.observationId, observationId),
        ),
      )
      .limit(1);
    return reply({
      result: audio?.sha256 === snapshot.audioSha256 ? snapshot : null,
    });
  } catch {
    return reply({ error: "ANALYSIS_HANDOFF_UNAVAILABLE" }, 503);
  }
}
