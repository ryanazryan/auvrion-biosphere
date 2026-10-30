import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AdminEnvironmentMap } from "@/components/admin/AdminEnvironmentMap";
import { DeviceAdminFrame } from "@/components/admin/DeviceAdminFrame";
import { getCurrentSession } from "@/server/auth/session";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import {
  adminCapabilityGrants,
  organizations,
} from "@/server/db/grants-schema";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Peta Lingkungan | Auvrion Biosphere",
  robots: { index: false, follow: false },
};
export default async function AdminEnvironmentMapPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const membership = await getDb()
    .select({ id: organizations.id })
    .from(adminCapabilityGrants)
    .innerJoin(
      organizations,
      eq(adminCapabilityGrants.organizationId, organizations.id),
    )
    .where(
      and(
        eq(adminCapabilityGrants.userId, current.user.id),
        eq(adminCapabilityGrants.capability, "manage_devices"),
        isNull(adminCapabilityGrants.revokedAt),
      ),
    )
    .limit(10);
  let allowed = false;
  for (const org of membership) {
    const result = await checkAdminAccess(org.id, "manage_devices");
    if (result.allowed) {
      allowed = true;
      break;
    }
  }
  if (!allowed)
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="font-semibold">Akses ditolak</h1>
        <p className="mt-2 text-sm">
          Perlu izin mengelola perangkat dan MFA aktif.
        </p>
      </main>
    );
  return (
    <DeviceAdminFrame pageName="Peta lingkungan">
      <AdminEnvironmentMap />
    </DeviceAdminFrame>
  );
}
