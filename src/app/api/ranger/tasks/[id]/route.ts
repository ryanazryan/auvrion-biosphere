import { checkOperationalAccess } from "@/server/authorization/operational-access";
import {
  isTaskUuid,
  parseRangerTaskDetailQuery,
} from "@/server/ranger/ranger-task-query";
import { getMyRangerTask } from "@/server/ranger/ranger-task-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const input = parseRangerTaskDetailQuery(new URL(request.url).searchParams);
  if (!input.ok || !isTaskUuid(id)) {
    return json({ error: "INVALID_RANGER_TASK_QUERY" }, 400);
  }

  const access = await checkOperationalAccess(input.organizationId, "ranger");
  if (!access.allowed) return json({ error: access.reason }, access.status);

  try {
    const task = await getMyRangerTask(input.organizationId, access.userId, id);
    return task ? json({ task }) : json({ error: "NOT_FOUND" }, 404);
  } catch {
    return json({ error: "RANGER_TASK_READ_FAILED" }, 500);
  }
}
