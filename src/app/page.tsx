import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { getCurrentSession } from "@/server/auth/session";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import { organizations } from "@/server/db/grants-schema";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // 1. Periksa sesi autentikasi.
  const currentSession = await getCurrentSession();

  // Pengguna yang belum login harus melakukan autentikasi.
  if (!currentSession) {
    redirect("/login");
  }

  // 2. Cari organisasi development yang digunakan AB-WC-003.
  const db = getDb();

  const [organization] = await db
    .select({
      id: organizations.id,
    })
    .from(organizations)
    .where(eq(organizations.code, "AUVRION-LOCAL"))
    .limit(1);

  // 3. Periksa apakah pengguna memiliki akses administrator.
  //
  // Pemeriksaan dilakukan di server:
  // - Akun disetujui dan aktif.
  // - Memiliki capability review_applications.
  // - Capability belum dicabut.
  // - Sesi memenuhi persyaratan MFA assurance.
  //
  // Jangan menentukan administrator hanya dari email atau
  // role yang dikirimkan oleh browser.
  if (organization) {
    const adminAccess = await checkAdminAccess(
      organization.id,
      "review_applications",
    );

    if (adminAccess.allowed) {
      redirect("/admin/access-applications");
    }
  }

  // 4. Fallback development workspace.
  //
  // Jika sesi ada tetapi tidak memiliki akses administrator,
  // pengguna tetap berada di halaman ini.
  //
  // Halaman ini tidak memberikan akses ke API atau dashboard
  // yang dilindungi authorization.
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
          <p className="text-sm font-semibold text-fg">Development Workspace</p>

          <p className="mt-2 text-sm leading-6 text-muted">
            Halaman sementara untuk pengujian autentikasi, logout, dan
            onboarding. Akses operasional dan administratif tetap mengikuti
            pemeriksaan authorization pada server.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <span className="text-xs text-muted">AB-WC-003 · Development</span>

          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
