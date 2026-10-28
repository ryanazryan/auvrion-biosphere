import "maplibre-gl/dist/maplibre-gl.css";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminLocationMap } from "@/components/gis/AdminLocationMap";
import { getCurrentSession } from "@/server/auth/session";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import { organizations } from "@/server/db/grants-schema";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Peta Lokasi Admin | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

export default async function AdminMapPage() {
  // Matches existing admin pages: admin workspace is development-only until
  // organization-scoped production admin routing has a reviewed design.
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  )
    notFound();
  const [org] = await getDb()
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.code, "AUVRION-LOCAL"))
    .limit(1);
  if (!org) notFound();
  const access = await checkAdminAccess(org.id, "manage_access");
  if (!access.allowed) {
    if (access.status === 401) redirect("/login");
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">Akses ditolak</h1>
        <p className="mt-2">Izin manage_access dan sesi MFA diperlukan.</p>
      </main>
    );
  }
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return (
    <AdminShell organizationName={org.name} adminEmail={session.user.email}>
      <AdminLocationMap organizationId={org.id} />
    </AdminShell>
  );
}
