import { and, eq, isNull } from "drizzle-orm";

import {
  hashVerificationToken,
  isVerificationTokenFormatValid,
} from "@/server/access-verification/token";
import { getDb } from "@/server/db";
import { accessApplications } from "@/server/db/access-schema";
import { accessEmailVerificationTokens } from "@/server/db/access-verification-schema";

export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store",
};

function jsonResponse(body: Record<string, string>, status: number) {
  return Response.json(body, { status, headers });
}

function isLocalRequestAllowed(request: Request): boolean {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  ) {
    return false;
  }

  const configuredUrl = process.env.BETTER_AUTH_URL;

  if (!configuredUrl) {
    return false;
  }

  const expectedOrigin = new URL(configuredUrl).origin;
  const requestUrl = new URL(request.url);

  return (
    ["localhost", "127.0.0.1"].includes(requestUrl.hostname) &&
    requestUrl.origin === expectedOrigin &&
    request.headers.get("origin") === expectedOrigin
  );
}

export async function POST(request: Request) {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  ) {
    return jsonResponse({ error: "NOT_AVAILABLE" }, 404);
  }

  if (!isLocalRequestAllowed(request)) {
    return jsonResponse({ error: "INVALID_ORIGIN" }, 403);
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    return jsonResponse({ error: "INVALID_CONTENT_TYPE" }, 415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (!Number.isFinite(contentLength) || contentLength > 1024) {
    return jsonResponse({ error: "INVALID_INPUT" }, 400);
  }

  let rawBody: string;

  try {
    const reader = request.body?.getReader();

    if (!reader) {
      return jsonResponse({ error: "INVALID_INPUT" }, 400);
    }

    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        total += value.byteLength;

        if (total > 1024) {
          await reader.cancel();
          return jsonResponse({ error: "INVALID_INPUT" }, 400);
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

    rawBody = new TextDecoder("utf-8", {
      fatal: true,
    }).decode(bytes);
  } catch {
    return jsonResponse({ error: "INVALID_INPUT" }, 400);
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "INVALID_INPUT" }, 400);
  }

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

  try {
    const verified = await getDb().transaction(async (tx) => {
      // Lock the token row to prevent concurrent reuse.
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

      if (
        record.usedAt !== null ||
        record.expiresAt.getTime() <= now.getTime()
      ) {
        return false;
      }

      // Only submitted applications may be verified.
      // This does not approve or activate an account.
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

      // Consume the token inside the same transaction.
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
        // Throw to roll back the application update.
        throw new Error("TOKEN_CONSUMPTION_CONFLICT");
      }

      return true;
    });

    if (!verified) {
      return jsonResponse({ error: "INVALID_OR_EXPIRED_TOKEN" }, 400);
    }

    return jsonResponse({ message: "EMAIL_VERIFIED" }, 200);
  } catch {
    return jsonResponse({ error: "VERIFICATION_UNAVAILABLE" }, 503);
  }
}
