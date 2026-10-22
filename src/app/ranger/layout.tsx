import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { RangerShell } from "@/components/ranger/RangerShell";
import { findRangerWorkspaceAccess } from "@/server/ranger/ranger-workspace";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Ranger | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

export default async function RangerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await findRangerWorkspaceAccess();
  if (!access.allowed) {
    if (access.status === 401) redirect("/login");
    return (
      <main className="grid min-h-dvh place-items-center bg-bg p-6">
        <section className="max-w-md rounded-xl border border-line bg-white p-7">
          <h1 className="text-xl font-semibold">Akses Ranger ditolak</h1>
          <p className="mt-3 text-sm text-muted">
            Akun aktif, grant Ranger, dan MFA sesi saat ini diperlukan.
          </p>
          <p className="mt-2 text-xs text-muted">Kode: {access.reason}</p>
          <a
            href="/"
            className="mt-5 inline-block text-sm font-semibold text-brand"
          >
            Kembali →
          </a>
        </section>
      </main>
    );
  }
  return (
    <RangerShell name={access.userName} org={access.organizationName}>
      {children}
    </RangerShell>
  );
}
