import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SupervisorShell } from "@/components/supervisor/SupervisorShell";
import { findWorkspaceAccess } from "@/server/workflow/workspace-queries";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Workspace Supervisor | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

export default async function SupervisorRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await findWorkspaceAccess("supervisor");
  if (!access.allowed) {
    if (access.status === 401) redirect("/login");
    return (
      <main className="grid min-h-dvh place-items-center bg-bg p-6">
        <section className="max-w-md rounded-lg border border-line bg-white p-7">
          <h1 className="text-xl font-semibold text-ink">
            Workspace Supervisor tidak tersedia
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Akun, grant Supervisor, organisasi, dan verifikasi MFA pada sesi
            sekarang wajib valid.
          </p>
          <p className="mt-3 text-xs text-muted">Kode: {access.reason}</p>
          <a
            className="mt-5 inline-block text-sm font-semibold text-brand"
            href="/"
          >
            Kembali ke beranda
          </a>
        </section>
      </main>
    );
  }
  return (
    <SupervisorShell
      userName={access.userName}
      orgName={access.organizationName}
    >
      {children}
    </SupervisorShell>
  );
}
