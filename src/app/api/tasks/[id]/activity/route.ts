import { and, asc, eq } from "drizzle-orm";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import {
  taskFindings,
  taskTransitionEvents,
} from "@/server/db/operations-domain-schema";
import { isTaskWorkflowUuid } from "@/server/workflow/approved-task-policy";
import { getWorkspaceTask } from "@/server/workflow/workspace-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}

/** Supervisor-only, organization-scoped activity projection; never exposes coordinates/media. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: taskId } = await context.params;
  const query = new URL(request.url).searchParams;
  const organizationId = query.get("organizationId");
  if (
    !isTaskWorkflowUuid(taskId) ||
    !isTaskWorkflowUuid(organizationId) ||
    query.size !== 1 ||
    query.getAll("organizationId").length !== 1
  ) {
    return json({ error: "INVALID_ACTIVITY_TARGET" }, 400);
  }
  const access = await checkOperationalAccess(organizationId, "supervisor");
  if (!access.allowed) return json({ error: access.reason }, access.status);
  try {
    const existing = await getWorkspaceTask(organizationId, taskId);
    if (!existing) return json({ error: "TASK_NOT_FOUND" }, 404);
    const [events, findings] = await Promise.all([
      getDb()
        .select({
          id: taskTransitionEvents.id,
          transitionId: taskTransitionEvents.transitionId,
          fromStatus: taskTransitionEvents.fromStatus,
          toStatus: taskTransitionEvents.toStatus,
          reason: taskTransitionEvents.reason,
          createdAt: taskTransitionEvents.createdAt,
        })
        .from(taskTransitionEvents)
        .where(
          and(
            eq(taskTransitionEvents.taskId, taskId),
            eq(taskTransitionEvents.organizationId, organizationId),
          ),
        )
        .orderBy(asc(taskTransitionEvents.createdAt))
        .limit(200),
      getDb()
        .select({
          id: taskFindings.id,
          summary: taskFindings.summary,
          createdAt: taskFindings.createdAt,
        })
        .from(taskFindings)
        .where(
          and(
            eq(taskFindings.taskId, taskId),
            eq(taskFindings.organizationId, organizationId),
          ),
        )
        .orderBy(asc(taskFindings.createdAt))
        .limit(200),
    ]);
    return json({
      task: { status: existing.task.status, version: existing.task.version },
      items: [
        ...events.map((event) => ({
          id: event.id,
          kind: "transition" as const,
          occurredAt: event.createdAt.toISOString(),
          title: `${event.fromStatus} → ${event.toStatus}`,
          description: event.reason,
          transitionId: event.transitionId,
        })),
        ...findings.map((finding) => ({
          id: finding.id,
          kind: "finding" as const,
          occurredAt: finding.createdAt.toISOString(),
          title: "Update temuan Ranger",
          description: finding.summary,
        })),
      ].sort((a, b) =>
        a.occurredAt === b.occurredAt
          ? a.id.localeCompare(b.id)
          : a.occurredAt.localeCompare(b.occurredAt),
      ),
    });
  } catch {
    return json({ error: "TASK_ACTIVITY_READ_FAILED" }, 500);
  }
}
