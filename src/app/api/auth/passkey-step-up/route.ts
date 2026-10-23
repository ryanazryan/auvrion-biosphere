import { and, eq, gt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { hasMfaSessionAssurance } from "@/server/auth/mfa-assurance-store";
import { getCurrentSession } from "@/server/auth/session";
import { checkAccountAccess } from "@/server/authorization/account-access";
import { getDb } from "@/server/db";
import { mfaSessionAssurance } from "@/server/db/mfa-assurance-schema";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Cross-origin scripts must never be able to refresh credential assurance.
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const session = await getCurrentSession();
  if (!session?.user.emailVerified) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const [account, assured] = await Promise.all([
    checkAccountAccess(),
    hasMfaSessionAssurance({
      sessionId: session.session.id,
      userId: session.user.id,
    }),
  ]);
  if (!account.allowed || !assured) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const payload: unknown = await request.json().catch(() => null);
  const code =
    payload && typeof payload === "object" && "code" in payload
      ? (payload as { code: unknown }).code
      : null;
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "INVALID_CODE" }, { status: 400 });
  }
  try {
    // Better Auth performs server-side TOTP verification and its own rate limits.
    const verified = await auth.api.verifyTOTP({
      headers: request.headers,
      body: { code, trustDevice: false },
    });
    // A successful re-verification of an active session returns the SAME session
    // token and user; never mint a new session or trust the browser's claims.
    if (
      !verified ||
      verified.token !== session.session.token ||
      verified.user.id !== session.user.id
    ) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const now = new Date();
    const [updated] = await getDb()
      .update(mfaSessionAssurance)
      .set({ verifiedAt: now })
      .where(
        and(
          eq(mfaSessionAssurance.sessionId, session.session.id),
          eq(mfaSessionAssurance.userId, session.user.id),
          gt(mfaSessionAssurance.expiresAt, now),
        ),
      )
      .returning({ sessionId: mfaSessionAssurance.sessionId });
    if (!updated)
      return NextResponse.json({ error: "MFA_REQUIRED" }, { status: 403 });
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "VERIFICATION_FAILED" }, { status: 403 });
  }
}
