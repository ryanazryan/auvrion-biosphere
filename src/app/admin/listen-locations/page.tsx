import { and, asc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import {
  adminCapabilityGrants,
  organizations,
} from "@/server/db/grants-schema";
import { ListenLocationForm } from "./form";

export const dynamic = "force-dynamic";
export default async function ListenLocationsAdminPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const db = getDb();
  const grants = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(adminCapabilityGrants)
    .innerJoin(
      organizations,
      eq(adminCapabilityGrants.organizationId, organizations.id),
    )
    .where(
      and(
        eq(adminCapabilityGrants.userId, session.user.id),
        eq(adminCapabilityGrants.capability, "manage_devices"),
        isNull(adminCapabilityGrants.revokedAt),
      ),
    )
    .orderBy(asc(organizations.name));
  for (const org of grants) {
    const access = await checkAdminAccess(org.id, "manage_devices");
    if (access.allowed)
      return (
        <ListenLocationForm
          organizationId={org.id}
          organizationName={org.name}
        />
      );
  }
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold">
        Akses administrasi perangkat diperlukan
      </h1>
      <p>Periksa izin manage_devices dan verifikasi MFA pada sesi Anda.</p>
    </main>
  );
}
