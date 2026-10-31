import "server-only";

import { and, eq } from "drizzle-orm";
import { dispatchDecisionNotification } from "@/server/access-decision-notifications/dispatch";
import {
  isAllowedOnboardingOrigin,
  onboardingEnabled,
} from "@/server/account-activation/onboarding-environment";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import { accessDecisionNotifications } from "@/server/db/access-decision-notification-schema";
import { organizations } from "@/server/db/grants-schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "no-store" };

function json(data: Record<string, string | number | boolean>, status: number) {
  return Response.json(data, { status, headers });
}

/**
 * Admin-only retry for one committed approval/rejection notification.
 * Idempotent: never duplicate a notification already marked sent.
 * No new approval, role, invite, password or MFA mutation is performed.
 */
export async function POST(request: Request, context: Context) {
  if (!onboardingEnabled(process.env))
    return json({ error: "NOT_AVAILABLE" }, 404);
  if (!isAllowedOnboardingOrigin(request, process.env))
    return json({ error: "INVALID_ORIGIN" }, 403);

  const { id } = await context.params;
  if (!UUID.test(id)) return json({ error: "INVALID_APPLICATION_ID" }, 400);

  const db = getDb();
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.code, "AUVRION-LOCAL"))
    .limit(1);
  if (!organization) return json({ error: "ORG_NOT_CONFIGURED" }, 503);

  const admin = await checkAdminAccess(organization.id, "manage_access");
  if (!admin.allowed) return json({ error: admin.reason }, admin.status);

  const [notification] = await db
    .select({
      id: accessDecisionNotifications.id,
      status: accessDecisionNotifications.status,
      nextAttemptAt: accessDecisionNotifications.nextAttemptAt,
    })
    .from(accessDecisionNotifications)
    .where(
      and(
        eq(accessDecisionNotifications.applicationId, id),
        eq(accessDecisionNotifications.organizationId, organization.id),
      ),
    )
    .limit(1);

  if (!notification) return json({ error: "NOTIFICATION_NOT_FOUND" }, 404);
  if (notification.status === "sent")
    return json({ delivery: "sent", alreadySent: true }, 200);
  if (notification.status === "processing")
    return json({ error: "DELIVERY_IN_PROGRESS" }, 409);

  const remaining = notification.nextAttemptAt.getTime() - Date.now();
  if (remaining > 0)
    return json(
      {
        error: "RETRY_COOLDOWN",
        retryAfterSeconds: Math.ceil(remaining / 1000),
      },
      429,
    );

  try {
    const outcome = await dispatchDecisionNotification(notification.id);
    if (outcome === "sent")
      return json({ delivery: "sent", alreadySent: false }, 200);
    // Another worker might have claimed the item, or SMTP may have failed again.
    return json({ delivery: "pending" }, 202);
  } catch {
    return json({ error: "DELIVERY_UNAVAILABLE" }, 503);
  }
}
