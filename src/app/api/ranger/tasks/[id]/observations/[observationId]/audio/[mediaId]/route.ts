import { parseAudioByteRange } from "@/server/evidence/playback-range";
import {
  RangerAudioError,
  readAuthorizedRangerTaskWav,
} from "@/server/evidence/ranger-playback-service";
import { isTaskUuid } from "@/server/ranger/ranger-task-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
};
const json = (data: unknown, status: number) =>
  Response.json(data, { status, headers });

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string; observationId: string; mediaId: string }>;
  },
): Promise<Response> {
  const { id: taskId, observationId, mediaId } = await context.params;
  const q = new URL(request.url).searchParams;
  const organizationId = q.get("organizationId") ?? "";
  if (
    q.size !== 1 ||
    q.getAll("organizationId").length !== 1 ||
    ![taskId, observationId, mediaId, organizationId].every(isTaskUuid)
  ) {
    return json({ error: "INVALID_RANGER_AUDIO_TARGET" }, 400);
  }
  try {
    const bytes = await readAuthorizedRangerTaskWav({
      taskId,
      observationId,
      mediaId,
      organizationId,
    });
    const total = bytes.byteLength;
    const range = parseAudioByteRange(request.headers.get("range"), total);
    if (range.kind === "invalid") {
      return new Response(null, {
        status: 416,
        headers: {
          ...headers,
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes */${total}`,
        },
      });
    }
    const start = range.kind === "partial" ? range.start : 0;
    const end = range.kind === "partial" ? range.end : total - 1;
    const bytesToSend = bytes.subarray(start, end + 1);
    const body = new Uint8Array(new ArrayBuffer(bytesToSend.byteLength));
    body.set(bytesToSend);
    return new Response(body, {
      status: range.kind === "partial" ? 206 : 200,
      headers: {
        ...headers,
        "Content-Type": "audio/wav",
        "Content-Disposition": 'inline; filename="listen-evidence.wav"',
        "Content-Length": String(body.byteLength),
        "Accept-Ranges": "bytes",
        ...(range.kind === "partial"
          ? { "Content-Range": `bytes ${start}-${end}/${total}` }
          : {}),
      },
    });
  } catch (error) {
    if (error instanceof RangerAudioError)
      return json({ error: error.reason }, error.status);
    return json({ error: "RANGER_AUDIO_UNAVAILABLE" }, 503);
  }
}
