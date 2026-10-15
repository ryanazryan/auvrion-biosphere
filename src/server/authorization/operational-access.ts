import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { checkAccountAccess } from "@/server/authorization/account-access";
import { getDb } from "@/server/db";
import { roleGrants } from "@/server/db/grants-schema";

type OperationalRole = typeof roleGrants.$inferSelect.role;

type OperationalAccessResult =
  | {
      allowed: false;
      status: 401 | 403;
      reason: string;
    }
  | {
      allowed: true;
      userId: string;
      organizationId: string;
      role: OperationalRole;
    };

export async function checkOperationalAccess(
  organizationId: string,
  requiredRole: OperationalRole,
): Promise<OperationalAccessResult> {
  const account = await checkAccountAccess();

  if (!account.allowed) {
    return account;
  }

  const db = getDb();

  const [grant] = await db
    .select({ id: roleGrants.id })
    .from(roleGrants)
    .where(
      and(
        eq(roleGrants.userId, account.userId),
        eq(roleGrants.organizationId, organizationId),
        eq(roleGrants.role, requiredRole),
        isNull(roleGrants.revokedAt),
      ),
    )
    .limit(1);

  if (!grant) {
    return {
      allowed: false,
      status: 403,
      reason: "ROLE_OR_SCOPE_DENIED",
    };
  }

  // Fail closed until server-side MFA assurance
  // is integrated and verified.
  return {
    allowed: false,
    status: 403,
    reason: "MFA_ASSURANCE_REQUIRED",
  };
}
