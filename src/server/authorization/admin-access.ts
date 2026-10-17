import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { hasMfaSessionAssurance } from "@/server/auth/mfa-assurance-store";
import { getCurrentSession } from "@/server/auth/session";
import { checkAccountAccess } from "@/server/authorization/account-access";
import { getDb } from "@/server/db";
import { adminCapabilityGrants } from "@/server/db/grants-schema";

type AdminCapability = typeof adminCapabilityGrants.$inferSelect.capability;

type AdminAccessResult =
  | {
      allowed: false;
      status: 401 | 403;
      reason: string;
    }
  | {
      allowed: true;
      userId: string;
      organizationId: string;
      capability: AdminCapability;
    };

export async function checkAdminAccess(
  organizationId: string,
  requiredCapability: AdminCapability,
): Promise<AdminAccessResult> {
  const account = await checkAccountAccess();

  if (!account.allowed) {
    return account;
  }

  const db = getDb();

  const [grant] = await db
    .select({
      id: adminCapabilityGrants.id,
    })
    .from(adminCapabilityGrants)
    .where(
      and(
        eq(adminCapabilityGrants.userId, account.userId),
        eq(adminCapabilityGrants.organizationId, organizationId),
        eq(adminCapabilityGrants.capability, requiredCapability),
        isNull(adminCapabilityGrants.revokedAt),
      ),
    )
    .limit(1);

  if (!grant) {
    return {
      allowed: false,
      status: 403,
      reason: "ADMIN_CAPABILITY_DENIED",
    };
  }

  // Read the current Better Auth server session.
  // Client-side redirects or TOTP flags are not proof.
  const currentSession = await getCurrentSession();

  if (!currentSession || currentSession.user.id !== account.userId) {
    return {
      allowed: false,
      status: 403,
      reason: "MFA_ASSURANCE_REQUIRED",
    };
  }

  const assured = await hasMfaSessionAssurance({
    sessionId: currentSession.session.id,
    userId: account.userId,
  });

  if (!assured) {
    return {
      allowed: false,
      status: 403,
      reason: "MFA_ASSURANCE_REQUIRED",
    };
  }

  return {
    allowed: true,
    userId: account.userId,
    organizationId,
    capability: requiredCapability,
  };
}
