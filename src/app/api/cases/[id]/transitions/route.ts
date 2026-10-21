import {
  isUuid,
  parseCaseTransitionCommand,
  WorkflowFailure,
} from "@/server/workflow/approved-case-policy";
import { transitionApprovedCase } from "@/server/workflow/case-transition-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_JSON_BYTES = 8 * 1024;
const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Origin",
  "X-Content-Type-Options": "nosniff",
};
const allowedFields = new Set([
  "transitionId",
  "expectedVersion",
  "reason",
  "assignment",
]);
const allowedAssignmentFields = new Set([
  "rangerUserId",
  "zoneId",
  "title",
  "instructions",
  "safetyNotes",
]);

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: responseHeaders });
}

function trustedSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || (site !== null && site !== "same-origin" && site !== "none")) {
    return false;
  }
  try {
    const configured = process.env.BETTER_AUTH_URL;
    if (!configured) return false;
    const expectedOrigin = new URL(configured).origin;
    return (
      request.url.startsWith(`${expectedOrigin}/`) && origin === expectedOrigin
    );
  } catch {
    return false;
  }
}

type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string };

async function readBoundedJson(request: Request): Promise<BodyResult> {
  const mime = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (mime !== "application/json") {
    return { ok: false, error: "JSON_CONTENT_TYPE_REQUIRED", status: 415 };
  }
  const encoding = request.headers.get("content-encoding")?.toLowerCase();
  if (encoding && encoding !== "identity") {
    return { ok: false, error: "CONTENT_ENCODING_NOT_ALLOWED", status: 415 };
  }
  const header = request.headers.get("content-length");
  let declared: number | null = null;
  if (header !== null) {
    if (!/^(0|[1-9]\d*)$/.test(header)) {
      return { ok: false, error: "INVALID_CONTENT_LENGTH", status: 400 };
    }
    declared = Number(header);
    if (!Number.isSafeInteger(declared)) {
      return { ok: false, error: "INVALID_CONTENT_LENGTH", status: 400 };
    }
    if (declared > MAX_JSON_BYTES) {
      return { ok: false, error: "BODY_TOO_LARGE", status: 413 };
    }
  }
  if (!request.body) return { ok: false, error: "EMPTY_BODY", status: 400 };

  const reader = request.body.getReader();
  const pieces: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => {});
        return { ok: false, error: "BODY_TOO_LARGE", status: 413 };
      }
      pieces.push(chunk.value);
    }
  } catch {
    return { ok: false, error: "BODY_READ_FAILED", status: 400 };
  } finally {
    reader.releaseLock();
  }

  if (total === 0) return { ok: false, error: "EMPTY_BODY", status: 400 };
  if (declared !== null && declared !== total) {
    return { ok: false, error: "CONTENT_LENGTH_MISMATCH", status: 400 };
  }
  try {
    return {
      ok: true,
      value: JSON.parse(Buffer.concat(pieces, total).toString("utf8")),
    };
  } catch {
    return { ok: false, error: "INVALID_JSON", status: 400 };
  }
}

/**
 * V1 only: POST /api/cases/[id]/transitions?organizationId=<uuid>
 * Idempotency-Key: <uuid>; Origin: trusted application origin.
 * Body: { transitionId, expectedVersion, reason, assignment? }.
 * Never accepts actor, scope, Case ID or request ID from the JSON body.
 * Actor/grant/current-session MFA and DB row locks are enforced by the service.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: caseId } = await context.params;
  const query = new URL(request.url).searchParams;
  const organizationId = query.get("organizationId");
  if (
    !isUuid(caseId) ||
    !isUuid(organizationId) ||
    query.size !== 1 ||
    query.getAll("organizationId").length !== 1
  ) {
    return json({ error: "INVALID_CASE_OR_ORGANIZATION_ID" }, 400);
  }
  if (!trustedSameOrigin(request)) {
    return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  }
  const requestId = request.headers.get("idempotency-key");
  if (!isUuid(requestId)) {
    return json({ error: "INVALID_IDEMPOTENCY_KEY" }, 400);
  }
  const body = await readBoundedJson(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  if (
    !body.value ||
    typeof body.value !== "object" ||
    Array.isArray(body.value)
  ) {
    return json({ error: "INVALID_WORKFLOW_REQUEST" }, 400);
  }
  const input = body.value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !allowedFields.has(key))) {
    return json({ error: "UNEXPECTED_WORKFLOW_FIELD" }, 400);
  }
  if (
    input.assignment &&
    typeof input.assignment === "object" &&
    !Array.isArray(input.assignment)
  ) {
    if (
      Object.keys(input.assignment).some(
        (key) => !allowedAssignmentFields.has(key),
      )
    ) {
      return json({ error: "UNEXPECTED_ASSIGNMENT_FIELD" }, 400);
    }
  }
  try {
    const command = parseCaseTransitionCommand({
      ...input,
      caseId,
      organizationId,
      requestId,
    });
    const result = await transitionApprovedCase(command);
    return json(result);
  } catch (error) {
    if (error instanceof WorkflowFailure) {
      return json({ error: error.code }, error.status);
    }
    // Do not disclose private DB errors, credentials, names, or location.
    return json({ error: "CASE_TRANSITION_FAILED" }, 500);
  }
}
