import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  createStatusSessionValue,
  hashStatusToken,
  STATUS_COOKIE_NAME,
  statusCookieOptions,
  validStatusLinkToken,
} from "@/server/access-status/tokens";
import { getDb } from "@/server/db";
import { accessStatusRecovery } from "@/server/db/access-status-schema";

export const runtime = "nodejs";

const error = (code: string, status: number) =>
  NextResponse.json(
    { error: code },
    { status, headers: { "Cache-Control": "no-store" } },
  );

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    return error("NOT_AVAILABLE", 404);
  if (request.headers.get("origin") !== url.origin)
    return error("INVALID_ORIGIN", 403);
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  ) {
    return error("INVALID_CONTENT_TYPE", 415);
  }

  // A recovery token is at most 43 characters; bound all incoming bytes.
  const reader = request.body?.getReader();
  if (!reader) return error("INVALID_INPUT", 400);
  let content = "";
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 512) return error("INVALID_INPUT", 400);
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return error("INVALID_INPUT", 400);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return error("INVALID_INPUT", 400);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !("token" in parsed) ||
    !validStatusLinkToken(parsed.token)
  ) {
    return error("INVALID_TOKEN", 400);
  }

  const token = parsed.token;

  try {
    const applicationId = await getDb().transaction(async (tx) => {
      const [record] = await tx
        .select({
          id: accessStatusRecovery.id,
          applicationId: accessStatusRecovery.applicationId,
          usedAt: accessStatusRecovery.usedAt,
          expiresAt: accessStatusRecovery.expiresAt,
        })
        .from(accessStatusRecovery)
        .where(eq(accessStatusRecovery.tokenHash, hashStatusToken(token)))
        .limit(1)
        .for("update");
      if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now())
        return null;
      const [used] = await tx
        .update(accessStatusRecovery)
        .set({
          usedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(accessStatusRecovery.id, record.id),
            isNull(accessStatusRecovery.usedAt),
          ),
        )
        .returning({ id: accessStatusRecovery.id });
      if (!used) throw new Error("TOKEN_CONSUMPTION_CONFLICT");
      return record.applicationId;
    });
    if (!applicationId) return error("INVALID_OR_EXPIRED_TOKEN", 400);

    const response = NextResponse.json(
      { message: "STATUS_ACCESS_GRANTED" },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(
      STATUS_COOKIE_NAME,
      createStatusSessionValue(applicationId),
      statusCookieOptions(),
    );
    return response;
  } catch {
    return error("STATUS_RECOVERY_UNAVAILABLE", 503);
  }
}
