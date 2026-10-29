import "server-only";

import { and, desc, eq, gt, ne } from "drizzle-orm";
import {
  hasMfaSessionAssurance,
  hasRecentMfaAssurance,
} from "@/server/auth/mfa-assurance-store";
import { getCurrentSession } from "@/server/auth/session";
import { checkAccountAccess } from "@/server/authorization/account-access";
import { getDb } from "@/server/db";
import { session as sessionTable } from "@/server/db/auth-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}

async function authorize() {
  const signed = await getCurrentSession();
  if (!signed)
    return { ok: false as const, status: 401, reason: "UNAUTHENTICATED" };
  const account = await checkAccountAccess();
  if (!account.allowed)
    return {
      ok: false as const,
      status: account.status,
      reason: account.reason,
    };
  if (account.userId !== signed.user.id) {
    return { ok: false as const, status: 403, reason: "ACCOUNT_MISMATCH" };
  }
  const assurance = await hasMfaSessionAssurance({
    sessionId: signed.session.id,
    userId: signed.user.id,
  });
  if (!assurance)
    return {
      ok: false as const,
      status: 403,
      reason: "MFA_ASSURANCE_REQUIRED",
    };
  return { ok: true as const, signed };
}

export async function GET() {
  const access = await authorize();
  if (!access.ok) return reply({ error: access.reason }, access.status);
  const rows = await getDb()
    .select({
      id: sessionTable.id,
      ipAddress: sessionTable.ipAddress,
      userAgent: sessionTable.userAgent,
      createdAt: sessionTable.createdAt,
      updatedAt: sessionTable.updatedAt,
      expiresAt: sessionTable.expiresAt,
    })
    .from(sessionTable)
    .where(
      and(
        eq(sessionTable.userId, access.signed.user.id),
        gt(sessionTable.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(sessionTable.updatedAt))
    .limit(50);
  return reply({
    sessions: rows.map((row) => ({
      ...row,
      current: row.id === access.signed.session.id,
      // Never return session tokens or MFA assurance secrets.
    })),
  });
}

export async function DELETE(request: Request) {
  const requestOrigin = request.headers.get("origin");
  const configuredOrigin = process.env.BETTER_AUTH_URL;
  if (!requestOrigin || !configuredOrigin) {
    return reply({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  }
  try {
    if (
      new URL(request.url).origin !== new URL(configuredOrigin).origin ||
      requestOrigin !== new URL(configuredOrigin).origin
    )
      return reply({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  } catch {
    return reply({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  }

  const access = await authorize();
  if (!access.ok) return reply({ error: access.reason }, access.status);
  const recent = await hasRecentMfaAssurance({
    sessionId: access.signed.session.id,
    userId: access.signed.user.id,
  });
  if (!recent) return reply({ error: "RECENT_MFA_REQUIRED" }, 403);

  // Cap the request body even for chunked transfer encoding.
  if (!request.body) return reply({ error: "INVALID_REQUEST" }, 400);
  let body: unknown;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 512) {
        await reader.cancel().catch(() => undefined);
        return reply({ error: "INVALID_REQUEST" }, 400);
      }
      chunks.push(part.value);
    }
    body = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    return reply({ error: "INVALID_REQUEST" }, 400);
  } finally {
    reader.releaseLock();
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("sessionId" in body) ||
    typeof body.sessionId !== "string" ||
    body.sessionId.length < 1 ||
    body.sessionId.length > 128
  )
    return reply({ error: "INVALID_REQUEST" }, 400);

  if (body.sessionId === access.signed.session.id) {
    return reply({ error: "CURRENT_SESSION_CANNOT_BE_REVOKED_HERE" }, 400);
  }
  const deleted = await getDb()
    .delete(sessionTable)
    .where(
      and(
        eq(sessionTable.id, body.sessionId),
        eq(sessionTable.userId, access.signed.user.id),
        ne(sessionTable.id, access.signed.session.id),
      ),
    )
    .returning({ id: sessionTable.id });
  if (deleted.length === 0) return reply({ error: "SESSION_NOT_FOUND" }, 404);
  // Database cascade also revokes per-session MFA assurance. Cookie cache is disabled.
  // Log only identity, not tokens, IP addresses or recovery secrets.
  console.info("Account remote session revoked", {
    userId: access.signed.user.id,
    revokedSessionId: deleted[0].id,
  });
  return reply({ revoked: true });
}
