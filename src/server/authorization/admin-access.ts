import "server-only";

import { and, eq, isNull } from "drizzle-orm";

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
    .select({ id: adminCapabilityGrants.id })
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

  // Administrative capability alone does not
  // satisfy the MFA assurance requirement.
  return {
    allowed: false,
    status: 403,
    reason: "MFA_ASSURANCE_REQUIRED",
  };
}
