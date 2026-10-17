import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { AccessApplicationsWorkspace } from "@/components/admin/access-applications-workspace";
import { getCurrentSession } from "@/server/auth/session";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import { accessApplications } from "@/server/db/access-schema";
import { organizations } from "@/server/db/grants-schema";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manajemen Permohonan Akses | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

export default async function AdminAccessApplicationsPage() {
  // access_applications has no organizationId. This queue must remain
  // local development-only until org-scoped application ownership exists.
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

  const authorization = await checkAdminAccess(
    organization.id,
    "review_applications",
  );

  if (!authorization.allowed) {
    if (authorization.status === 401) redirect("/login");

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f7] px-5">
        <section className="w-full max-w-md rounded-xl border border-[#e1e8e2] bg-white p-8">
          <h1 className="text-xl font-semibold text-[#142d25]">
            Akses administrator ditolak
          </h1>
          <p className="mt-3 text-sm text-[#5f6d65]">
            Sesi Anda belum memenuhi persyaratan untuk meninjau permohonan.
          </p>
          <p className="mt-4 rounded-md bg-[#f7f9f7] p-3 font-mono text-xs text-[#5f6d65]">
            {authorization.reason}
          </p>
          <a
            href="/"
            className="mt-6 inline-block text-sm font-medium text-[#20785f] hover:underline"
          >
            Kembali ke beranda
          </a>
        </section>
      </main>
    );
  }

  const records = await db
    .select({
      id: accessApplications.id,
      applicantName: accessApplications.applicantName,
      email: accessApplications.email,
      status: accessApplications.status,
      emailVerifiedAt: accessApplications.emailVerifiedAt,
      createdAt: accessApplications.createdAt,
      reviewedAt: accessApplications.reviewedAt,
      decisionReason: accessApplications.decisionReason,
    })
    .from(accessApplications)
    .orderBy(desc(accessApplications.createdAt))
    .limit(200);

  const currentSession = await getCurrentSession();
  if (!currentSession) redirect("/login");

  return (
    <AccessApplicationsWorkspace
      adminEmail={currentSession.user.email}
      organizationName={organization.name}
      records={records.map((record) => ({
        id: record.id,
        applicantName: record.applicantName,
        email: record.email,
        status: record.status,
        emailVerifiedAt: record.emailVerifiedAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        reviewedAt: record.reviewedAt?.toISOString() ?? null,
        decisionReason: record.decisionReason,
      }))}
    />
  );
}
