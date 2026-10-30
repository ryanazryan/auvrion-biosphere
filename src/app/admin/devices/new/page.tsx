import { and, desc, eq, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { DeviceManagementWorkspace } from "@/components/admin/device-management-workspace";
import { getCurrentSession } from "@/server/auth/session";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import { organizations } from "@/server/db/grants-schema";
import { observationSources } from "@/server/db/observation-domain-schema";
import { ingestionDevices } from "@/server/db/wc017-device-persistence-schema";
import { ingestionRecordings } from "@/server/db/wc017-device-recordings-schema";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Perangkat IoT | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

/** The existing Admin workspace is restricted to one local development tenant. */
export default async function AdminDevicesPage() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  ) {
    notFound();
  }
  const db = getDb();
  const [organization] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.code, "AUVRION-LOCAL"))
    .limit(1);
  if (!organization) notFound();

  const access = await checkAdminAccess(organization.id, "manage_devices");
  if (!access.allowed) {
    if (access.status === 401) redirect("/login");
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <h1 className="text-xl font-semibold">
          Akses manajemen perangkat ditolak
        </h1>
        <p className="mt-2 text-sm text-muted">
          Izin manage_devices dan verifikasi MFA diperlukan untuk mengelola
          perangkat.
        </p>
        <p className="mt-3 text-xs text-muted">{access.reason}</p>
      </main>
    );
  }
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  // All reads are scoped to the SAME organization used by the capability check.
  // Never load or transmit credential_hash or retired token history to the client.
  const [sources, rows, counts] = await Promise.all([
    db
      .select({
        id: observationSources.id,
        code: observationSources.code,
        label: observationSources.label,
        kind: observationSources.kind,
        isActive: observationSources.isActive,
      })
      .from(observationSources)
      .where(
        and(
          eq(observationSources.organizationId, organization.id),
          eq(observationSources.kind, "listen_device"),
        ),
      )
      .orderBy(observationSources.label)
      .limit(200),
    db
      .select({
        id: ingestionDevices.id,
        sourceId: ingestionDevices.sourceId,
        status: ingestionDevices.status,
        credentialVersion: ingestionDevices.credentialVersion,
        createdAt: ingestionDevices.createdAt,
        revokedAt: ingestionDevices.revokedAt,
        sourceCode: observationSources.code,
        sourceLabel: observationSources.label,
        sourceActive: observationSources.isActive,
      })
      .from(ingestionDevices)
      .innerJoin(
        observationSources,
        and(
          eq(ingestionDevices.sourceId, observationSources.id),
          eq(
            ingestionDevices.organizationId,
            observationSources.organizationId,
          ),
        ),
      )
      .where(eq(ingestionDevices.organizationId, organization.id))
      .orderBy(desc(ingestionDevices.createdAt))
      .limit(200),
    db
      .select({
        deviceId: ingestionRecordings.deviceId,
        recordingCount: sql<number>`count(*)::integer`,
        lastReceivedAt: sql<Date | null>`max(${ingestionRecordings.createdAt})`,
      })
      .from(ingestionRecordings)
      .where(eq(ingestionRecordings.organizationId, organization.id))
      .groupBy(ingestionRecordings.deviceId),
  ]);
  const stats = new Map(counts.map((x) => [x.deviceId, x]));

  return (
    <AdminShell
      organizationName={organization.name}
      adminEmail={session.user.email}
    >
      <DeviceManagementWorkspace
        organizationId={organization.id}
        organizationName={organization.name}
        sources={sources}
        devices={rows.map((row) => {
          const count = stats.get(row.id);
          return {
            ...row,
            status:
              row.status === "revoked"
                ? ("revoked" as const)
                : ("active" as const),
            createdAt: row.createdAt.toISOString(),
            revokedAt: row.revokedAt?.toISOString() ?? null,
            recordingCount: count?.recordingCount ?? 0,
            lastReceivedAt: count?.lastReceivedAt
              ? new Date(count.lastReceivedAt).toISOString()
              : null,
          };
        })}
      />
    </AdminShell>
  );
}
