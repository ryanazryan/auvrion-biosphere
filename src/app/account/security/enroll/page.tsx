import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthHeader, AuthLayout } from "@/components/auth/auth-layout";
import { TotpEnrollment } from "@/components/auth/totp-enrollment";
import { isTotpEnrollmentEligible } from "@/server/auth/enrollment-eligibility";
import { getCurrentSession } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Siapkan Autentikator | Auvrion Biosphere",
};

export default async function EnrollmentPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const eligible = await isTotpEnrollmentEligible({
    id: session.user.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
  });

  return (
    <AuthLayout>
      {eligible ? (
        <TotpEnrollment />
      ) : (
        <>
          <AuthHeader title="Akses sedang diverifikasi">
            Akun Anda belum memenuhi persyaratan untuk menyiapkan autentikator.
            Persetujuan administrator dan grant eksplisit diperlukan terlebih
            dahulu.
          </AuthHeader>
          <p className="text-sm text-muted">
            Hubungi administrator organisasi jika Anda membutuhkan bantuan.
            Tidak ada akses operasional yang diberikan oleh halaman ini.
          </p>
        </>
      )}
    </AuthLayout>
  );
}
