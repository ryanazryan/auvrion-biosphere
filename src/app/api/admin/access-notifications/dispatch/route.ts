import "server-only";

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { dispatchDecisionNotification } from "@/server/access-decision-notifications/dispatch";
import {
  isAllowedOnboardingOrigin,
  onboardingEnabled,
} from "@/server/account-activation/onboarding-environment";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import { organizations } from "@/server/db/grants-schema";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status, headers });
}

/**
 * Local-only manual retry trigger. A real deployment needs a trusted worker
 * or scheduler instead of relying on admin requests to drain the outbox.
 */
export async function POST(request: NextRequest) {
  if (!onboardingEnabled(process.env)) {
    return errorResponse("NOT_FOUND", 404);
  }

  if (!isAllowedOnboardingOrigin(request, process.env)) {
    return errorResponse("INVALID_ORIGIN", 403);
  }

  const [organization] = await getDb()
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.code, "AUVRION-LOCAL"))
    .limit(1);

  if (!organization) return errorResponse("ORG_NOT_CONFIGURED", 503);

  const access = await checkAdminAccess(organization.id, "manage_access");
  if (!access.allowed) return errorResponse(access.reason, access.status);

  let sent = 0;
  let deferred = 0;
  let inspected = 0;

  try {
    for (let index = 0; index < 10; index += 1) {
      const result = await dispatchDecisionNotification();
      if (result === "idle") break;
      inspected += 1;
      if (result === "sent") sent += 1;
      else deferred += 1;
    }
  } catch {
    return errorResponse("DISPATCH_UNAVAILABLE", 503);
  }

  return NextResponse.json(
    { inspected, sent, deferred, note: "Local outbox dispatch completed" },
    { headers },
  );
}
