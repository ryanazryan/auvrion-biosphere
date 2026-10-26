import {
  isTaskWorkflowUuid,
  TaskWorkflowFailure,
} from "@/server/workflow/approved-task-policy";
import {
  readTaskJson,
  sameOrigin,
  taskResponseHeaders,
} from "@/server/workflow/task-route-security";
import { createRangerFinding } from "@/server/workflow/task-transition-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: taskResponseHeaders });
}

/** One immutable update per request, visible to the assigned task's Supervisor. */
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
    return json({ error: "INVALID_FINDING_TARGET" }, 400);
  }
  if (!sameOrigin(request)) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  const requestId = request.headers.get("idempotency-key");
  if (!isTaskWorkflowUuid(requestId)) {
    return json({ error: "INVALID_IDEMPOTENCY_KEY" }, 400);
  }
  const parsed = await readTaskJson(request);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
  if (Object.keys(parsed.body).some((key) => key !== "summary")) {
    return json({ error: "UNEXPECTED_FINDING_FIELD" }, 400);
  }
  try {
    const result = await createRangerFinding({
      taskId,
      organizationId,
      requestId,
      summary: parsed.body.summary,
    });
    return json(result, result.replayed ? 200 : 201);
  } catch (error) {
    if (error instanceof TaskWorkflowFailure) {
      return json({ error: error.code }, error.status);
    }
    return json({ error: "FINDING_WRITE_FAILED" }, 500);
  }
}
