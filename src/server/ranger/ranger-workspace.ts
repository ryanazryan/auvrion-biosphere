import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/server/auth/session";
import { checkAccountAccess } from "@/server/authorization/account-access";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import { organizations, roleGrants } from "@/server/db/grants-schema";

/** Resolve organization from live signed-in Ranger, never from URL or client state. */
export async function findRangerWorkspaceAccess() {
  const account = await checkAccountAccess();
  if (!account.allowed) return account;
  const session = await getCurrentSession();
  if (!session || session.user.id !== account.userId) {
    return {
      allowed: false as const,
      status: 401 as const,
      reason: "UNAUTHENTICATED",
    };
  }
  const [org] = await getDb()
    .select({ id: organizations.id, name: organizations.name })
    .from(roleGrants)
    .innerJoin(organizations, eq(roleGrants.organizationId, organizations.id))
    .where(
      and(
        eq(roleGrants.userId, account.userId),
        eq(roleGrants.role, "ranger"),
        isNull(roleGrants.revokedAt),
      ),
    )
    .orderBy(asc(organizations.name))
    .limit(1);
  if (!org)
    return {
      allowed: false as const,
      status: 403 as const,
      reason: "ROLE_OR_SCOPE_DENIED",
    };
  const access = await checkOperationalAccess(org.id, "ranger");
  if (!access.allowed) return access;
  return {
    allowed: true as const,
    userId: access.userId,
    organizationId: org.id,
    organizationName: org.name,
    userName: session.user.name?.trim() || session.user.email,
  };
}
