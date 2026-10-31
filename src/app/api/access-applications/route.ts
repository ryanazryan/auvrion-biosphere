import { sql } from "drizzle-orm";
import { validateAccessRequest } from "@/lib/access-request";
import { issueVerificationEmail } from "@/server/access-verification/issue";
import {
  isAllowedOnboardingOrigin,
  onboardingEnabled,
} from "@/server/account-activation/onboarding-environment";
import { consumeOnboardingBudget } from "@/server/account-activation/public-rate-limit";
import { getDb } from "@/server/db";
import { accessApplications } from "@/server/db/access-schema";
import { user } from "@/server/db/auth-schema";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 4096;
const responseHeaders = { "Cache-Control": "no-store" };

const acceptanceMessage = {
  message: "Jika data memenuhi syarat, permohonan akan diproses.",
};

function accepted() {
  // Deliberately identical for an existing account, existing application,
  // and a newly submitted application. Do not return an application ID.
  return Response.json(acceptanceMessage, {
    status: 202,
    headers: responseHeaders,
  });
}

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: responseHeaders });
}

/** Read with a hard byte bound, including chunked requests. */
async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("INVALID_BODY");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
      chunks.push(value);
    }
  } catch (cause) {
    await reader.cancel().catch(() => undefined);
    throw cause;
  } finally {
    reader.releaseLock();
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export async function POST(request: Request) {
  // Onboarding is explicitly enabled only for configured local or production environments.
  if (!onboardingEnabled(process.env)) {
    return errorResponse("REQUEST_ACCESS_NOT_AVAILABLE", 404);
  }

  // Require browser-style same-origin POST; this is not a substitute for
  // public endpoint throttling or server-side application authorization.
  if (!isAllowedOnboardingOrigin(request, process.env)) {
    return errorResponse("INVALID_ORIGIN", 403);
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return errorResponse("INVALID_CONTENT_TYPE", 415);
  }

  const advertisedLength = Number(request.headers.get("content-length") ?? 0);
  if (advertisedLength > MAX_REQUEST_BYTES) {
    return errorResponse("REQUEST_TOO_LARGE", 413);
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(request);
  } catch (cause) {
    if (cause instanceof Error && cause.message === "REQUEST_TOO_LARGE") {
      return errorResponse("REQUEST_TOO_LARGE", 413);
    }
    return errorResponse("INVALID_JSON", 400);
  }

  const validation = validateAccessRequest(payload);
  if (!validation.ok) {
    return errorResponse("INVALID_INPUT", 400);
  }

  const { name, email } = validation.value;

  // Shared PostgreSQL per-IP/per-email/global abuse controls (fail closed).
  try {
    if (!(await consumeOnboardingBudget(request, "submit", email))) {
      return errorResponse("RATE_LIMITED", 429);
    }
  } catch {
    return errorResponse("SERVICE_UNAVAILABLE", 503);
  }
  let newlyCreated = false;

  try {
    await getDb().transaction(async (tx) => {
      // Serialize concurrent submissions for the same normalized email.
      // The DB does not yet have a unique email constraint on applications.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('access-request'), hashtext(${email}))`,
      );

      const [existingApplication] = await tx
        .select({ id: accessApplications.id })
        .from(accessApplications)
        .where(sql`lower(${accessApplications.email}) = ${email}`)
        .limit(1);

      const [existingUser] = await tx
        .select({ id: user.id })
        .from(user)
        .where(sql`lower(${user.email}) = ${email}`)
        .limit(1);

      if (!existingApplication && !existingUser) {
        await tx.insert(accessApplications).values({
          applicantName: name,
          email,
          status: "submitted",
        });
        newlyCreated = true;
      }
    });
  } catch {
    // Avoid exposing DB errors or PII to anonymous clients.
    return errorResponse("SERVICE_UNAVAILABLE", 503);
  }

  // New applicants receive a verification link automatically. If delivery fails,
  // their application remains saved; /request-access/resend supports recovery.
  if (newlyCreated) {
    try {
      if (await consumeOnboardingBudget(request, "verification-email", email)) {
        await issueVerificationEmail(email);
      }
    } catch {
      // Avoid logging applicant emails or tokens. Resend is explicitly available.
      console.error("Applicant verification mail could not be dispatched");
    }
  }
  return accepted();
}
