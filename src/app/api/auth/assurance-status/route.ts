import { eq } from "drizzle-orm";
import {
  getMfaAssuranceState,
  mustReauthenticate,
} from "@/server/auth/mfa-assurance-store";
import { getCurrentSession } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { userAccess } from "@/server/db/access-schema";
import { user } from "@/server/db/auth-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = {
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const session = await getCurrentSession();
    if (!session)
      return Response.json(
        { authenticated: false, state: "missing" },
        { headers },
      );
    const state = await getMfaAssuranceState({
      sessionId: session.session.id,
      userId: session.user.id,
    });
    const [account] = await getDb()
      .select({ status: userAccess.status, totpEnabled: user.twoFactorEnabled })
      .from(userAccess)
      .innerJoin(user, eq(userAccess.userId, user.id))
      .where(eq(userAccess.userId, session.user.id))
      .limit(1);
    const reauthRequired = mustReauthenticate(
      state,
      account?.status ?? null,
      account?.totpEnabled ?? false,
    );
    return Response.json(
      { authenticated: true, state, reauthRequired },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "SESSION_STATUS_UNAVAILABLE" },
      { status: 503, headers },
    );
  }
}
