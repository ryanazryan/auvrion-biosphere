import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { PasskeyManager } from "@/components/auth/PasskeyManager";
import * as I from "@/figma-operator/components/icons";
import {
  hasMfaSessionAssurance,
  hasRecentMfaAssurance,
} from "@/server/auth/mfa-assurance-store";
import { getCurrentSession } from "@/server/auth/session";
import { checkAccountAccess } from "@/server/authorization/account-access";
import { getDb } from "@/server/db";
import { passkey, user } from "@/server/db/auth-schema";
import {
  adminCapabilityGrants,
  organizations,
  roleGrants,
} from "@/server/db/grants-schema";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Profil & Keamanan | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

const PANEL = "overflow-hidden rounded-xl border border-line bg-white";
const ROLES = {
  operator: { label: "Operator", path: "/operator/overview" },
  supervisor: { label: "Supervisor", path: "/supervisor/overview" },
  ranger: { label: "Ranger", path: "/ranger" },
} as const;

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-8">
      <div className="mb-3">
        <h2
          id={`${id}-heading`}
          className="text-[16px] font-semibold tracking-tight text-ink"
        >
          {title}
        </h2>
        {note && (
          <p className="mt-1 text-[13px] leading-5 text-muted">{note}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 min-w-0 wrap-break-word text-[13px] font-medium text-fg">
        {children}
      </dd>
    </div>
  );
}

function Fact({
  label,
  value,
  detail,
  positive,
}: {
  label: string;
  value: string;
  detail: string;
  positive?: boolean;
}) {
  return (
    <div className="min-w-0 bg-white px-4 py-4">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink">
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-full ${positive ? "bg-brand" : "bg-muted"}`}
        />
        {value}
      </dd>
      <dd className="mt-1 text-xs leading-5 text-muted">{detail}</dd>
    </div>
  );
}

function Row({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-5">
      <div className="flex min-w-0 gap-3">
        <span
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-bg text-muted [&_svg]:size-4"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">{title}</p>
          {description && (
            <p className="mt-1 max-w-[65ch] text-xs leading-5 text-muted">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0 sm:ml-2">{action}</div>}
    </div>
  );
}

const NAV = [
  ["profil", "Profil"],
  ["akses", "Akses organisasi"],
  ["status", "Ringkasan keamanan"],
  ["totp", "Autentikator"],
  ["pemulihan", "Kode pemulihan"],
  ["passkey", "Passkey"],
  ["sesi", "Sesi & akun"],
] as const;

export default async function AccountSecurityPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const db = getDb();
  const [assured, recentMfa, access, grants, adminGrants, accountIdentity] =
    await Promise.all([
      hasMfaSessionAssurance({
        sessionId: session.session.id,
        userId: session.user.id,
      }),
      hasRecentMfaAssurance({
        sessionId: session.session.id,
        userId: session.user.id,
      }),
      checkAccountAccess(),
      db
        .select({
          id: roleGrants.id,
          role: roleGrants.role,
          organizationName: organizations.name,
        })
        .from(roleGrants)
        .innerJoin(
          organizations,
          eq(roleGrants.organizationId, organizations.id),
        )
        .where(
          and(
            eq(roleGrants.userId, session.user.id),
            isNull(roleGrants.revokedAt),
          ),
        ),
      db
        .select({ id: adminCapabilityGrants.id })
        .from(adminCapabilityGrants)
        .where(
          and(
            eq(adminCapabilityGrants.userId, session.user.id),
            isNull(adminCapabilityGrants.revokedAt),
          ),
        )
        .limit(1),
      db
        .select({ totpEnabled: user.twoFactorEnabled })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1),
    ]);
  const totpEnabled = accountIdentity[0]?.totpEnabled === true;
  const canManagePasskeys =
    access.allowed && (grants.length > 0 || adminGrants.length > 0) && assured;
  const devices = canManagePasskeys
    ? (
        await db
          .select({
            id: passkey.id,
            name: passkey.name,
            createdAt: passkey.createdAt,
            deviceType: passkey.deviceType,
            backedUp: passkey.backedUp,
            transports: passkey.transports,
          })
          .from(passkey)
          .where(eq(passkey.userId, session.user.id))
      ).map((device) => ({
        ...device,
        createdAt: device.createdAt?.toISOString() ?? null,
      }))
    : [];
  const returnPath = grants.find((g) => g.role === "operator")
    ? "/operator/overview"
    : grants.find((g) => g.role === "supervisor")
      ? "/supervisor/overview"
      : grants.find((g) => g.role === "ranger")
        ? "/ranger"
        : adminGrants.length
          ? "/admin/access-applications"
          : "/";

  return (
    <main className="min-h-dvh bg-bg px-4 py-7 text-fg sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-290">
        <header className="mb-8 flex flex-col gap-3 border-b border-line pb-6">
          <Link
            href={returnPath}
            className="inline-flex min-h-10 w-fit items-center gap-2 text-[13px] font-medium text-brand hover:underline"
          >
            <I.ArrowLeft className="size-4" /> Kembali ke ruang kerja
          </Link>
          <div>
            <p className="text-xs font-medium text-muted">Akun</p>
            <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-ink">
              Profil &amp; Keamanan
            </h1>
            <p className="mt-1.5 text-[13px] text-muted">
              Identitas, akses organisasi, dan metode verifikasi akun.
            </p>
          </div>
        </header>

        <div className="lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-9 xl:gap-12">
          <nav
            aria-label="Bagian Profil dan Keamanan"
            className="hidden lg:block"
          >
            <ul className="sticky top-6 space-y-1 border-l border-line">
              {NAV.map(([id, label]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="-ml-px flex min-h-9 items-center border-l-2 border-transparent pl-4 text-[13px] text-muted transition-colors hover:border-brand hover:text-ink focus-visible:border-brand focus-visible:text-ink"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-9 pb-10">
            <Section id="profil" title="Profil">
              <div className={PANEL}>
                <dl className="grid gap-x-8 gap-y-5 px-4 py-5 sm:grid-cols-2 sm:px-5">
                  <Field label="Nama lengkap">{session.user.name}</Field>
                  <Field label="Email">
                    <span className="break-all">{session.user.email}</span>
                  </Field>
                  <Field label="Verifikasi email">
                    {session.user.emailVerified
                      ? "Terverifikasi"
                      : "Belum terverifikasi"}
                  </Field>
                  <Field label="Status akses">
                    {access.allowed ? "Aktif" : "Perlu pemeriksaan"}
                  </Field>
                </dl>
              </div>
            </Section>

            <Section id="akses" title="Akses organisasi">
              <div className={`${PANEL} divide-y divide-line`}>
                {grants.length ? (
                  grants.map((grant) => {
                    const info =
                      grant.role === "operator"
                        ? ROLES.operator
                        : grant.role === "supervisor"
                          ? ROLES.supervisor
                          : grant.role === "ranger"
                            ? ROLES.ranger
                            : null;
                    return (
                      <Row
                        key={grant.id}
                        icon={<I.Users />}
                        title={grant.organizationName}
                        description={`Peran: ${info?.label ?? grant.role}`}
                        action={
                          info ? (
                            <Link
                              href={info.path}
                              className="inline-flex min-h-10 items-center rounded-md border border-line-strong px-3 text-xs font-semibold text-brand hover:bg-bg"
                            >
                              Buka ruang kerja
                            </Link>
                          ) : undefined
                        }
                      />
                    );
                  })
                ) : (
                  <p className="px-5 py-5 text-[13px] text-muted">
                    Tidak ada peran organisasi aktif.
                  </p>
                )}
                {adminGrants.length > 0 && (
                  <Row
                    icon={<I.Shield />}
                    title="Akses administrator"
                    description="Hak administratif terverifikasi pada akun ini."
                  />
                )}
              </div>
            </Section>

            <Section id="status" title="Ringkasan keamanan">
              <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
                <Fact
                  label="Email"
                  value={
                    session.user.emailVerified
                      ? "Terverifikasi"
                      : "Belum diverifikasi"
                  }
                  detail="Status akun saat ini"
                  positive={session.user.emailVerified}
                />
                <Fact
                  label="Autentikator"
                  value={totpEnabled ? "Terdaftar" : "Belum terdaftar"}
                  detail="Kode TOTP enam digit"
                  positive={totpEnabled}
                />
                <Fact
                  label="MFA sesi"
                  value={assured ? "Terverifikasi" : "Perlu verifikasi"}
                  detail="Berlaku untuk sesi aktif"
                  positive={assured}
                />
                <Fact
                  label="Passkey"
                  value={
                    devices.length
                      ? `${devices.length} terdaftar`
                      : "Belum ditampilkan"
                  }
                  detail="Akses kelola memerlukan MFA"
                  positive={devices.length > 0}
                />
              </dl>
            </Section>

            <Section id="totp" title="Autentikator">
              <div className={PANEL}>
                <Row
                  icon={<I.Shield />}
                  title={
                    totpEnabled
                      ? "Aplikasi autentikator terdaftar"
                      : "Autentikator belum terdaftar"
                  }
                  description="Kode TOTP enam digit digunakan saat verifikasi dua faktor."
                  action={
                    !totpEnabled ? (
                      <Link
                        href="/account/security/enroll"
                        className="inline-flex min-h-10 items-center rounded-md bg-brand px-3 text-xs font-semibold text-white"
                      >
                        Daftarkan autentikator
                      </Link>
                    ) : undefined
                  }
                />
                <div className="border-t border-line bg-[#fbfcfb] px-5 py-3 text-xs leading-5 text-muted">
                  Perubahan autentikator harus melalui alur keamanan yang
                  diverifikasi server.
                </div>
              </div>
            </Section>

            <Section id="pemulihan" title="Kode pemulihan">
              <div className={PANEL}>
                <Row
                  icon={<I.Lock />}
                  title="Kode pemulihan disimpan secara pribadi"
                  description="Kode baru ditampilkan saat enrollment TOTP. Kode yang pernah disimpan tidak ditampilkan ulang pada halaman ini."
                />
                <div className="border-t border-line bg-[#fbfcfb] px-5 py-3 text-xs leading-5 text-muted">
                  Pemakaian kode pemulihan saat login masih memerlukan alur yang
                  telah diuji. Jika autentikator hilang, hubungi administrator
                  melalui proses pemulihan resmi.
                </div>
              </div>
            </Section>

            <Section id="passkey" title="Passkey">
              {canManagePasskeys ? (
                <PasskeyManager
                  initialPasskeys={devices}
                  recentMfa={recentMfa}
                  signInEnabled={process.env.ENABLE_PASSKEY_SIGNIN === "YES"}
                />
              ) : (
                <div className={PANEL}>
                  <Row
                    icon={<I.Lock />}
                    title="Akses pengelolaan Passkey memerlukan MFA"
                    description="Masuk kembali dan verifikasi TOTP sebelum mengelola perangkat Passkey."
                  />
                </div>
              )}
            </Section>

            <Section id="sesi" title="Sesi & akun">
              <div className={PANEL}>
                <Row
                  icon={<I.Shield />}
                  title="Sesi ini"
                  description={
                    assured
                      ? "Verifikasi MFA berlaku pada sesi saat ini."
                      : "MFA sesi belum terverifikasi."
                  }
                />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-4 sm:px-5">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                    <I.LogOut className="size-4 text-muted" /> Keluar dari akun
                  </span>
                  <LogoutButton />
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}
