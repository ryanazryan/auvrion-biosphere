import {
  isTaskWorkflowUuid,
  TaskWorkflowFailure,
} from "@/server/workflow/approved-task-policy";
import {
  readTaskJson,
  sameOrigin,
  taskResponseHeaders,
} from "@/server/workflow/task-route-security";
import { transitionApprovedTask } from "@/server/workflow/task-transition-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: taskResponseHeaders });
}

/** AB-WC-013 Task state mutations: role/MFA/scope enforced inside service. */
export async function POST(
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
    return json({ error: "INVALID_TASK_OR_ORGANIZATION_ID" }, 400);
  }
  if (!sameOrigin(request)) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  const requestId = request.headers.get("idempotency-key");
  if (!isTaskWorkflowUuid(requestId))
    return json({ error: "INVALID_IDEMPOTENCY_KEY" }, 400);
  const parsed = await readTaskJson(request);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
  if (
    Object.keys(parsed.body).some(
      (key) => !["transitionId", "expectedVersion", "reason"].includes(key),
    )
  ) {
    return json({ error: "UNEXPECTED_TASK_FIELD" }, 400);
  }
  try {
    const result = await transitionApprovedTask({
      ...parsed.body,
      taskId,
      organizationId,
      requestId,
    });
    return json(result);
  } catch (error) {
    if (error instanceof TaskWorkflowFailure)
      return json({ error: error.code }, error.status);
    return json({ error: "TASK_TRANSITION_FAILED" }, 500);
  }
}
