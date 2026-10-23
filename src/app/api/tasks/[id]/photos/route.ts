import {
  listAuthorizedTaskPhotos,
  RangerPhotoFailure,
} from "@/server/evidence/ranger-photo-service";
import { isTaskWorkflowUuid } from "@/server/workflow/approved-task-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
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
    return Response.json(
      { error: "INVALID_PHOTO_TARGET" },
      { status: 400, headers: HEADERS },
    );
  }
  try {
    const photos = await listAuthorizedTaskPhotos(organizationId, taskId);
    return Response.json({ photos }, { headers: HEADERS });
  } catch (error) {
    const status = error instanceof RangerPhotoFailure ? error.status : 500;
    const code =
      error instanceof RangerPhotoFailure ? error.code : "PHOTO_LIST_FAILED";
    return Response.json({ error: code }, { status, headers: HEADERS });
  }
}
