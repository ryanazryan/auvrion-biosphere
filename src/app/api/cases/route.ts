import {
  CaseIntakeFailure,
  parseCaseIntakeInput,
} from "@/server/workflow/case-intake-policy";
import { createReviewCase } from "@/server/workflow/case-intake-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Origin",
  "X-Content-Type-Options": "nosniff",
};
const MAX_BODY_BYTES = 8 * 1024;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });

function trustedOrigin(request: Request): boolean {
  const configured = process.env.BETTER_AUTH_URL;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    !configured ||
    !origin ||
    (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
  )
    return false;
  try {
    const trusted = new URL(configured).origin;
    return origin === trusted && new URL(request.url).origin === trusted;
  } catch {
    return false;
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const mime = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (mime !== "application/json")
    throw new CaseIntakeFailure(400, "JSON_CONTENT_TYPE_REQUIRED");
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity")
    throw new CaseIntakeFailure(400, "CONTENT_ENCODING_NOT_ALLOWED");
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^(0|[1-9]\d*)$/.test(declaredLength) ||
      !Number.isSafeInteger(Number(declaredLength)))
  ) {
    throw new CaseIntakeFailure(400, "INVALID_CONTENT_LENGTH");
  }
  if (declaredLength !== null && Number(declaredLength) > MAX_BODY_BYTES)
    throw new CaseIntakeFailure(400, "BODY_TOO_LARGE");
  if (!request.body) throw new CaseIntakeFailure(400, "EMPTY_BODY");
  const reader = request.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new CaseIntakeFailure(400, "BODY_TOO_LARGE");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new CaseIntakeFailure(400, "EMPTY_BODY");
  if (declaredLength !== null && Number(declaredLength) !== total)
    throw new CaseIntakeFailure(400, "CONTENT_LENGTH_MISMATCH");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new CaseIntakeFailure(400, "INVALID_JSON");
  }
}

/** POST is only the human Operator intake boundary; no Task writes or AI auto-confirmation. */
export async function POST(request: Request) {
  if (!trustedOrigin(request))
    return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  try {
    const raw = await readBoundedJson(request);
    const input = parseCaseIntakeInput(raw);
    const result = await createReviewCase(input);
    return json(result, result.replayed ? 200 : 201);
  } catch (error) {
    if (error instanceof CaseIntakeFailure)
      return json({ error: error.code }, error.status);
    return json({ error: "CASE_INTAKE_FAILED" }, 500);
  }
}
