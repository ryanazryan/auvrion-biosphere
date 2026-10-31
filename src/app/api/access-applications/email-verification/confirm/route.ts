import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import {
  createStatusSessionValue,
  STATUS_COOKIE_NAME,
  statusCookieOptions,
} from "@/server/access-status/tokens";
import {
  hashVerificationToken,
  isVerificationTokenFormatValid,
} from "@/server/access-verification/token";
import {
  isAllowedOnboardingOrigin,
  onboardingEnabled,
} from "@/server/account-activation/onboarding-environment";
import { getDb } from "@/server/db";
import { accessApplications } from "@/server/db/access-schema";
import { accessEmailVerificationTokens } from "@/server/db/access-verification-schema";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024;

const responseHeaders = {
  "Cache-Control": "no-store",
};

function jsonResponse(body: Record<string, string>, status: number) {
  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function isLocalRequestAllowed(request: Request): boolean {
  return isAllowedOnboardingOrigin(request, process.env);
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();

  if (!reader) {
    throw new Error("INVALID_BODY");
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      total += value.byteLength;

      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("REQUEST_TOO_LARGE");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const rawBody = new TextDecoder("utf-8", {
    fatal: true,
  }).decode(bytes);

  return JSON.parse(rawBody) as unknown;
}

export async function POST(request: Request) {
  // ---------------------------------------------------
  // 1. Development-only endpoint gate
  // ---------------------------------------------------

  if (!onboardingEnabled(process.env)) {
    return jsonResponse({ error: "NOT_AVAILABLE" }, 404);
  }

  // ---------------------------------------------------
  // 2. Same-origin validation
  // ---------------------------------------------------

  if (!isLocalRequestAllowed(request)) {
    return jsonResponse({ error: "INVALID_ORIGIN" }, 403);
  }

  // ---------------------------------------------------
  // 3. Content-Type validation
  // ---------------------------------------------------

  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    return jsonResponse({ error: "INVALID_CONTENT_TYPE" }, 415);
  }

  // ---------------------------------------------------
  // 4. Request size validation
  // ---------------------------------------------------

  const contentLengthHeader = request.headers.get("content-length");

  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);

    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 0 ||
      contentLength > MAX_BODY_BYTES
    ) {
      return jsonResponse({ error: "INVALID_INPUT" }, 400);
    }
  }

  // ---------------------------------------------------
  // 5. Safely parse request body
  // ---------------------------------------------------

  let payload: unknown;

  try {
    payload = await readBoundedJson(request);
  } catch {
    return jsonResponse({ error: "INVALID_INPUT" }, 400);
  }

  // ---------------------------------------------------
  // 6. Verification token validation
  // ---------------------------------------------------

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !("token" in payload) ||
    !isVerificationTokenFormatValid(payload.token)
  ) {
    return jsonResponse({ error: "INVALID_TOKEN" }, 400);
  }

  const tokenHash = hashVerificationToken(payload.token);
  const now = new Date();

  // ---------------------------------------------------
  // 7. Atomic email verification transaction
  // ---------------------------------------------------

  let verifiedApplicationId: string | false;

  try {
    verifiedApplicationId = await getDb().transaction(async (tx) => {
      // Lock token row to prevent concurrent reuse.
      const [record] = await tx
        .select({
          id: accessEmailVerificationTokens.id,
          applicationId: accessEmailVerificationTokens.applicationId,
          expiresAt: accessEmailVerificationTokens.expiresAt,
          usedAt: accessEmailVerificationTokens.usedAt,
        })
        .from(accessEmailVerificationTokens)
        .where(eq(accessEmailVerificationTokens.tokenHash, tokenHash))
        .limit(1)
        .for("update");

      if (!record) {
        return false;
      }

      // Reject consumed or expired tokens.
      if (
        record.usedAt !== null ||
        record.expiresAt.getTime() <= now.getTime()
      ) {
        return false;
      }

      // Only submitted applications can transition
      // to email_verified.
      const [updatedApplication] = await tx
        .update(accessApplications)
        .set({
          status: "email_verified",
          emailVerifiedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(accessApplications.id, record.applicationId),
            eq(accessApplications.status, "submitted"),
            isNull(accessApplications.emailVerifiedAt),
          ),
        )
        .returning({
          id: accessApplications.id,
        });

      if (!updatedApplication) {
        return false;
      }

      // Consume token in the same transaction.
      const [consumed] = await tx
        .update(accessEmailVerificationTokens)
        .set({
          usedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(accessEmailVerificationTokens.id, record.id),
            isNull(accessEmailVerificationTokens.usedAt),
          ),
        )
        .returning({
          id: accessEmailVerificationTokens.id,
        });

      if (!consumed) {
        // Roll back the application status update.
        throw new Error("TOKEN_CONSUMPTION_CONFLICT");
      }

      // Return the verified application ID.
      // Never trust an application ID supplied
      // directly by the browser.
      return record.applicationId;
    });
  } catch {
    return jsonResponse({ error: "VERIFICATION_UNAVAILABLE" }, 503);
  }

  // ---------------------------------------------------
  // 8. Handle invalid, expired, or reused tokens
  // ---------------------------------------------------

  if (!verifiedApplicationId) {
    return jsonResponse({ error: "INVALID_OR_EXPIRED_TOKEN" }, 400);
  }

  // ---------------------------------------------------
  // 9. Create applicant status session
  // ---------------------------------------------------
  //
  // IMPORTANT:
  // Email verification has already committed to
  // PostgreSQL.
  //
  // Cookie creation must not be treated as part of
  // the database transaction.
  //
  // The status cookie is NOT a Better Auth login session
  // and must not grant application permissions.

  try {
    const cookieStore = await cookies();

    const sessionValue = createStatusSessionValue(verifiedApplicationId);

    cookieStore.set(STATUS_COOKIE_NAME, sessionValue, statusCookieOptions());
  } catch {
    // Verification succeeded, but status session
    // initialization failed.
    //
    // Do not report email verification as failed.
    // The applicant can request a recovery link
    // through /request-access/status.

    return jsonResponse(
      {
        message: "EMAIL_VERIFIED_STATUS_SESSION_UNAVAILABLE",
      },
      200,
    );
  }

  // ---------------------------------------------------
  // 10. Verification + status session successful
  // ---------------------------------------------------

  return jsonResponse({ message: "EMAIL_VERIFIED" }, 200);
}
