import { redirect } from "next/navigation";
import { ExpiredSessionAction } from "@/components/auth/ExpiredSessionAction";
import { getMfaAssuranceState } from "@/server/auth/mfa-assurance-store";
import { getCurrentSession } from "@/server/auth/session";
export const dynamic = "force-dynamic";
export default async function SessionExpiredPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?reason=mfa-expired");
  const state = await getMfaAssuranceState({
    sessionId: session.session.id,
    userId: session.user.id,
  });
  if (state === "valid") redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-5">
      <section className="w-full max-w-md rounded-xl border border-line bg-white p-7 shadow-sm">
        <h1 className="text-xl font-semibold">Verifikasi keamanan berakhir</h1>
        <p className="mt-3 text-sm text-muted">
          Sesi masuk sebelumnya masih tercatat, tetapi izin akses operasional
          sudah kedaluwarsa. Untuk keamanan, Anda perlu masuk ulang dan
          menyelesaikan autentikator.
        </p>
        <ExpiredSessionAction />
      </section>
    </main>
  );
}
