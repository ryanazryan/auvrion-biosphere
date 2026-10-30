import { getAuthorizedRangerTaskLocation } from "@/server/ranger/ranger-task-location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const q = new URL(request.url).searchParams;
  const organizationId = q.get("organizationId") ?? "";
  if (q.size !== 1 || q.getAll("organizationId").length !== 1) {
    return Response.json(
      { error: "INVALID_TASK_LOCATION_REQUEST" },
      { status: 400, headers },
    );
  }
  const result = await getAuthorizedRangerTaskLocation(organizationId, id);
  return Response.json(result.data, { status: result.status, headers });
}
