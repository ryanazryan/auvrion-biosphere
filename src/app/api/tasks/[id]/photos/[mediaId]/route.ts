import {
  RangerPhotoFailure,
  readAuthorizedTaskPhoto,
} from "@/server/evidence/ranger-photo-service";
import { isTaskWorkflowUuid } from "@/server/workflow/approved-task-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
};
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { id: taskId, mediaId } = await context.params;
  const query = new URL(request.url).searchParams;
  const organizationId = query.get("organizationId");
  if (
    !isTaskWorkflowUuid(taskId) ||
    !isTaskWorkflowUuid(mediaId) ||
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
    const { bytes, mimeType } = await readAuthorizedTaskPhoto(
      organizationId,
      taskId,
      mediaId,
    );
    const body = new Uint8Array(new ArrayBuffer(bytes.byteLength));
    body.set(bytes);
    return new Response(body, {
      status: 200,
      headers: {
        ...HEADERS,
        "Content-Type": mimeType,
        "Content-Length": String(body.byteLength),
        "Content-Disposition": 'inline; filename="ranger-evidence"',
      },
    });
  } catch (error) {
    const status = error instanceof RangerPhotoFailure ? error.status : 500;
    const code =
      error instanceof RangerPhotoFailure ? error.code : "PHOTO_READ_FAILED";
    return Response.json({ error: code }, { status, headers: HEADERS });
  }
}
