import { and, asc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { getCurrentSession } from "@/server/auth/session";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import { organizations, roleGrants } from "@/server/db/grants-schema";
import { getRoleHomeCandidates } from "@/server/navigation/role-home";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const currentSession = await getCurrentSession();
  if (!currentSession) redirect("/login");

  const db = getDb();
  const [devOrganization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.code, "AUVRION-LOCAL"))
    .limit(1);

  // Admin pages currently exist only for local development and enabled access requests.
  if (
    devOrganization &&
    process.env.NODE_ENV === "development" &&
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS === "YES"
  ) {
    const reviewAccess = await checkAdminAccess(
      devOrganization.id,
      "review_applications",
    );
    if (reviewAccess.allowed) redirect("/admin/access-applications");

    const manageAccess = await checkAdminAccess(
      devOrganization.id,
      "manage_access",
    );
    if (manageAccess.allowed) redirect("/admin/access-users");
  }

  // WC-013: resolve verified role-specific home without trusting the browser.
  // An active role grant alone is insufficient: current-session MFA and account
  // approval are still enforced by checkOperationalAccess.
  const assignments = await db
    .select({
      role: roleGrants.role,
      organizationId: organizations.id,
    })
    .from(roleGrants)
    .innerJoin(organizations, eq(roleGrants.organizationId, organizations.id))
    .where(
      and(
        eq(roleGrants.userId, currentSession.user.id),
        isNull(roleGrants.revokedAt),
      ),
    )
    .orderBy(asc(organizations.name));

  // Prefer higher-priority roles, but authorize each candidate on the server.
  for (const candidate of getRoleHomeCandidates(assignments)) {
    const access = await checkOperationalAccess(
      candidate.organizationId,
      candidate.role,
    );
    if (access.allowed) redirect(candidate.href);
  }

  // Existing safe fallback for pending/unsupported roles. Do not grant broad access.
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-5 py-12">
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand">
          <span className="text-xl font-bold">A</span>
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          Auvrion Biosphere
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-fg">Selamat datang</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Anda berhasil masuk ke aplikasi Auvrion Biosphere.
        </p>
        <div className="mt-6 rounded-lg border border-line bg-bg p-4">
          <p className="text-xs text-muted">Akun yang sedang login</p>
          <p className="mt-1 break-all text-sm font-medium text-fg">
            {currentSession.user.email}
          </p>
        </div>
        <div className="mt-6 rounded-lg border border-line p-4">
          <p className="text-sm font-semibold text-fg">
            Workspace belum tersedia
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Workspace hanya tersedia bagi akun yang disetujui, memiliki izin
            aktif, dan sudah memenuhi MFA pada sesi ini. Periksa akses Anda atau
            hubungi administrator.
          </p>
        </div>
        <div className="mt-6 flex items-center justify-between gap-4">
          <span className="text-xs text-muted">Auvrion Biosphere · V1</span>
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
