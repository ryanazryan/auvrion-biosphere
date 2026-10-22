import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { parseRangerTasksQuery } from "@/server/ranger/ranger-task-query";
import { listMyRangerTasks } from "@/server/ranger/ranger-task-service";

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

/** Read-only, assigned-only. No proposed Task transitions in V1. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const input = parseRangerTasksQuery(params);
  if (!input.ok) return json({ error: input.error }, 400);

  const access = await checkOperationalAccess(input.organizationId, "ranger");
  if (!access.allowed) return json({ error: access.reason }, access.status);

  try {
    return json(
      await listMyRangerTasks(input.organizationId, access.userId, input.limit),
    );
  } catch {
    return json({ error: "RANGER_TASK_READ_FAILED" }, 500);
  }
}
