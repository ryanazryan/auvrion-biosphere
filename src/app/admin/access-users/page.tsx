import { desc, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { AccessUsersWorkspace } from "@/components/admin/access-users-workspace";
import { getCurrentSession } from "@/server/auth/session";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import { accessLifecycleAudit } from "@/server/db/access-lifecycle-audit-schema";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import { user } from "@/server/db/auth-schema";
import {
  adminCapabilityGrants,
  organizations,
  roleGrants,
} from "@/server/db/grants-schema";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Pengguna & Hak Akses | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

export default async function AdminAccessUsersPage() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  )
    notFound();

  const db = getDb();
  const [organization] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.code, "AUVRION-LOCAL"))
    .limit(1);
  if (!organization) notFound();

  const admin = await checkAdminAccess(organization.id, "manage_access");
  if (!admin.allowed) {
    if (admin.status === 401) redirect("/login");
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold">Akses ditolak</h1>
        <p className="mt-3 text-sm">Izin manage_access dan MFA diperlukan.</p>
      </main>
    );
  }
  const current = await getCurrentSession();
  if (!current) redirect("/login");

  // Historical scoped grants establish membership after a role is revoked.
  // This is deliberately limited to the one local V1 organization.
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      accessStatus: userAccess.status,
      applicationStatus: accessApplications.status,
      role: roleGrants.role,
      revokedAt: roleGrants.revokedAt,
      createdAt: userAccess.createdAt,
    })
    .from(roleGrants)
    .innerJoin(userAccess, eq(userAccess.userId, roleGrants.userId))
    .innerJoin(user, eq(user.id, userAccess.userId))
    .innerJoin(
      accessApplications,
      eq(accessApplications.id, userAccess.applicationId),
    )
    .where(eq(roleGrants.organizationId, organization.id))
    .orderBy(desc(userAccess.createdAt))
    .limit(500);

  const userMap = new Map<
    string,
    {
      userId: string;
      name: string;
      email: string;
      accessStatus: "pending_activation" | "active" | "disabled";
      activeRoles: Array<"operator" | "supervisor" | "ranger">;
    }
  >();
  for (const record of rows) {
    if (record.applicationStatus !== "approved") continue;
    const existing = userMap.get(record.userId);
    if (!existing) {
      userMap.set(record.userId, {
        userId: record.userId,
        name: record.name,
        email: record.email,
        accessStatus: record.accessStatus,
        activeRoles: record.revokedAt ? [] : [record.role],
      });
    } else if (
      !record.revokedAt &&
      !existing.activeRoles.includes(record.role)
    ) {
      existing.activeRoles.push(record.role);
    }
  }

  const privileged = await db
    .select({ userId: adminCapabilityGrants.userId })
    .from(adminCapabilityGrants)
    .where(isNull(adminCapabilityGrants.revokedAt));
  const protectedIds = new Set(privileged.map((row) => row.userId));

  const events = await db
    .select({
      id: accessLifecycleAudit.id,
      action: accessLifecycleAudit.action,
      targetUserId: accessLifecycleAudit.targetUserId,
      createdAt: accessLifecycleAudit.createdAt,
      reason: accessLifecycleAudit.reason,
    })
    .from(accessLifecycleAudit)
    .where(eq(accessLifecycleAudit.organizationId, organization.id))
    .orderBy(desc(accessLifecycleAudit.createdAt))
    .limit(20);

  return (
    <AccessUsersWorkspace
      adminEmail={current.user.email}
      organizationName={organization.name}
      users={Array.from(userMap.values()).map((entry) => ({
        ...entry,
        protectedAdmin: protectedIds.has(entry.userId),
      }))}
      audit={events.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      }))}
    />
  );
}
