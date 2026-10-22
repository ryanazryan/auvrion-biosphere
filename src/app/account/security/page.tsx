import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { hasMfaSessionAssurance } from "@/server/auth/mfa-assurance-store";
import { getCurrentSession } from "@/server/auth/session";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Profil & Keamanan | Auvrion Biosphere",
  robots: { index: false, follow: false },
};
export default async function AccountSecurityPage() {
  const data = await getCurrentSession();
  if (!data) redirect("/login");
  const assured = await hasMfaSessionAssurance({
    sessionId: data.session.id,
    userId: data.user.id,
  });
  return (
    <main className="min-h-dvh bg-bg px-5 py-12">
      <section className="mx-auto max-w-xl rounded-xl border border-line bg-white p-6 shadow-sm">
        <a href="/" className="text-[13px] text-brand hover:underline">
          ← Kembali
        </a>
        <h1 className="mt-5 text-2xl font-semibold text-ink">
          Profil & Keamanan
        </h1>
        <dl className="mt-6 divide-y divide-line text-sm">
          <div className="py-3">
            <dt className="text-muted">Nama</dt>
            <dd className="mt-1 font-medium">{data.user.name}</dd>
          </div>
          <div className="py-3">
            <dt className="text-muted">Email</dt>
            <dd className="mt-1 break-all font-medium">{data.user.email}</dd>
          </div>
          <div className="py-3">
            <dt className="text-muted">Verifikasi email</dt>
            <dd className="mt-1">
              {data.user.emailVerified
                ? "Terverifikasi"
                : "Belum terverifikasi"}
            </dd>
          </div>
          <div className="py-3">
            <dt className="text-muted">MFA pada sesi sekarang</dt>
            <dd
              className={`mt-1 font-medium ${assured ? "text-brand" : "text-warn"}`}
            >
              {assured ? "Terverifikasi" : "Belum terverifikasi / kedaluwarsa"}
            </dd>
          </div>
        </dl>
        <p className="my-5 text-[13px] text-muted">
          Penggantian autentikator, kode pemulihan, dan pengelolaan sesi mandiri
          belum tersedia.
        </p>
        <LogoutButton />
      </section>
    </main>
  );
}
