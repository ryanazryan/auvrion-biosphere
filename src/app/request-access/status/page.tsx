import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessApplicationProgress } from "@/components/auth/access-application-progress";
import { AccessStatusLiveRefresh } from "@/components/auth/access-status-live-refresh";
import { AccessStatusRecoveryForm } from "@/components/auth/access-status-recovery-form";
import { AuthLayout } from "@/components/auth/auth-layout";
import {
  STATUS_COOKIE_NAME,
  statusCookieOptions,
  verifyStatusSessionValue,
} from "@/server/access-status/tokens";
import { onboardingEnabled } from "@/server/account-activation/onboarding-environment";
import { getDb } from "@/server/db";
import { accessApplications, userAccess } from "@/server/db/access-schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Status Permohonan | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

const LABELS = {
  submitted: "Menunggu verifikasi email",
  email_verified: "Menunggu persetujuan administrator",
  approved: "Lolos peninjauan administrator",
  rejected: "Permohonan ditolak",
} as const;

const MESSAGES = {
  submitted:
    "Silakan verifikasi alamat email melalui pesan yang dikirimkan. Jika email tidak ditemukan, minta tautan verifikasi ulang.",
  email_verified:
    "Email Anda telah diverifikasi. Administrator belum menyelesaikan peninjauan. Anda dapat kembali ke halaman ini nanti.",
  approved:
    "Permohonan Anda telah disetujui. Saat ini akun dan hak akses sedang disiapkan. Anda akan menerima instruksi aktivasi melalui email ketika akun siap.",
  rejected:
    "Permohonan tidak disetujui. Silakan menghubungi administrator organisasi untuk bantuan.",
} as const;

async function forgetStatusSession() {
  "use server";

  const cookieStore = await cookies();

  cookieStore.set(STATUS_COOKIE_NAME, "", {
    ...statusCookieOptions(),
    maxAge: 0,
  });

  redirect("/request-access");
}

export default async function ApplicantStatusPage() {
  if (!onboardingEnabled(process.env)) notFound();

  const cookieStore = await cookies();
  const applicationId = verifyStatusSessionValue(
    cookieStore.get(STATUS_COOKIE_NAME)?.value,
  );

  const [record] = applicationId
    ? await getDb()
        .select({
          applicantName: accessApplications.applicantName,
          status: accessApplications.status,
          email: accessApplications.email,
        })
        .from(accessApplications)
        .where(eq(accessApplications.id, applicationId))
        .limit(1)
    : [];

  const [accountState] =
    record && applicationId
      ? await getDb()
          .select({ status: userAccess.status })
          .from(userAccess)
          .where(eq(userAccess.applicationId, applicationId))
          .limit(1)
      : [];

  if (!record)
    return (
      <AuthLayout>
        <AccessStatusRecoveryForm />
        {applicationId && (
          <form action={forgetStatusSession} className="mt-4 text-center">
            <button
              type="submit"
              className="text-sm font-medium text-brand hover:underline"
            >
              Akhiri sesi status lama dan ajukan akses baru
            </button>
          </form>
        )}
      </AuthLayout>
    );

  return (
    <AuthLayout>
      <div
        className="mb-5 grid size-11 place-items-center rounded-lg bg-brand-50 text-brand"
        aria-hidden="true"
      >
        ✓
      </div>
      <h1 className="text-2xl font-semibold text-fg">
        {record.status === "approved" && accountState?.status === "active"
          ? "Akun aktif"
          : record.status === "approved" && accountState?.status === "disabled"
            ? "Akun dinonaktifkan"
            : record.status === "approved" &&
                accountState?.status === "pending_activation"
              ? "Periksa email aktivasi"
              : LABELS[record.status]}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Halo, {record.applicantName}.{" "}
        {record.status === "approved" && accountState?.status === "active"
          ? "Akun sudah aktif. Masuk menggunakan kata sandi dan TOTP."
          : record.status === "approved" && accountState?.status === "disabled"
            ? "Akun sedang dinonaktifkan. Hubungi administrator organisasi sebelum mencoba aktivasi."
            : record.status === "approved" &&
                accountState?.status === "pending_activation"
              ? "Akun dan peran Anda sudah disiapkan. Periksa inbox atau folder spam untuk undangan aktivasi. Jika sudah menerima tautan, buka untuk membuat kata sandi, lalu lanjutkan pengaturan autentikator. Jika belum ada email, hubungi administrator untuk memeriksa pengiriman undangan."
              : MESSAGES[record.status]}
      </p>
      <AccessApplicationProgress
        status={record.status}
        activated={accountState?.status === "active"}
        provisioned={accountState?.status === "pending_activation"}
      />
      <dl className="mt-6 space-y-3 rounded-lg border border-line bg-surface p-4 text-sm">
        <div>
          <dt className="text-xs text-muted">Email pengajuan</dt>
          <dd className="mt-1 break-all font-medium">{record.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Status permohonan</dt>
          <dd className="mt-1 font-semibold text-brand">
            {LABELS[record.status]}
          </dd>
        </div>
      </dl>
      {record.status === "submitted" && (
        <Link
          href="/request-access/resend"
          className="mt-5 block rounded-md bg-brand px-4 py-3 text-center text-sm font-medium text-white"
        >
          Kirim ulang verifikasi email
        </Link>
      )}
      <AccessStatusLiveRefresh
        monitoring={
          record.status === "submitted" ||
          record.status === "email_verified" ||
          (record.status === "approved" &&
            accountState?.status !== "active" &&
            accountState?.status !== "disabled")
        }
      />
      {record.status === "approved" && accountState?.status === "active" && (
        <Link
          href="/login"
          className="mt-4 block rounded-md bg-brand px-4 py-3 text-center text-sm font-medium text-white"
        >
          Masuk ke Auvrion Biosphere
        </Link>
      )}
      <form action={forgetStatusSession} className="mt-5">
        <button
          type="submit"
          className="text-sm font-medium text-brand hover:underline"
        >
          Gunakan email lain / akhiri sesi status
        </button>
      </form>
    </AuthLayout>
  );
}
