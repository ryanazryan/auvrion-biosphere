import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { hasMfaSessionAssurance } from "@/server/auth/mfa-assurance-store";
import { getCurrentSession } from "@/server/auth/session";
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

  // A client-side MFA flag, factor enrollment, or a previous login is not
  // evidence that the CURRENT session passed an MFA login challenge.
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
    role: requiredRole,
  };
}
