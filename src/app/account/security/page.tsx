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
import { passkey } from "@/server/db/auth-schema";
import { adminCapabilityGrants, roleGrants } from "@/server/db/grants-schema";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Profil & Keamanan | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

const panel =
  "min-w-0 rounded-2xl border border-line bg-white shadow-[0_12px_36px_-28px_rgba(16,53,35,0.28)]";

function RoundIcon({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eaf5ee] text-brand [&_svg]:size-5"
    >
      {children}
    </span>
  );
}

function StatusRow({
  label,
  icon,
  good,
}: {
  label: string;
  icon: ReactNode;
  good: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-line bg-[#fafcfb] px-3 py-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <RoundIcon>{icon}</RoundIcon>
        <span className="text-[13px] font-semibold text-ink">{label}</span>
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${good ? "bg-[#e7f4eb] text-[#165c3e]" : "bg-warn-50 text-warn"}`}
      >
        {good ? (
          <I.Check className="size-3.5" />
        ) : (
          <I.Alert className="size-3.5" />
        )}
        {good ? "Terverifikasi" : "Perlu verifikasi"}
      </span>
    </div>
  );
}

export default async function AccountSecurityPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const db = getDb();
  const [assured, recentMfa, account, grants, adminGrants] = await Promise.all([
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
      .select({ role: roleGrants.role })
      .from(roleGrants)
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
  ]);

  const role = (["supervisor", "operator", "ranger"] as const).find(
    (candidate) => grants.some((grant) => grant.role === candidate),
  );
  const roleLabel = role
    ? { supervisor: "Supervisor", operator: "Operator", ranger: "Ranger" }[role]
    : adminGrants.length > 0
      ? "Administrator"
      : "Akun Auvrion";

  // This query uses the authenticated user ID and never exposes other users' keys.
  // No unsolicited client-side /passkey/list-user-passkeys request is needed.
  const canManagePasskeys =
    account.allowed && (grants.length > 0 || adminGrants.length > 0) && assured;
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

  return (
    <main className="min-h-dvh bg-[#f6f9f7] px-4 py-4 text-fg sm:px-6 xl:h-dvh xl:overflow-hidden lg:px-8 xl:py-5">
      <div className="mx-auto flex w-full max-w-[1450px] flex-col xl:h-full">
        <header className="mb-4 shrink-0 sm:mb-5">
          <Link
            href="/"
            className="inline-flex min-h-8 items-center gap-2 text-[12px] font-semibold text-brand hover:text-brand-hover"
          >
            <I.ArrowLeft className="size-4" /> Kembali ke ruang kerja
          </Link>
          <h1 className="mt-2 text-[29px] font-bold tracking-tight text-ink sm:text-[34px]">
            Profil &amp; Keamanan
          </h1>
        </header>

        <div className="grid min-h-0 flex-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-5">
          <section
            className={`${panel} flex min-h-0 flex-col p-5 sm:p-6 xl:overflow-hidden`}
            aria-label="Identitas dan keamanan akun"
          >
            <div className="flex min-w-0 items-center gap-5 pb-6">
              <span
                aria-hidden="true"
                className="grid size-18 shrink-0 place-items-center rounded-full bg-[#e5f2ea] text-brand sm:size-22"
              >
                <I.Users className="size-9 sm:size-10" />
              </span>
              <dl className="min-w-0 flex-1 space-y-2.5 text-[13px]">
                <div>
                  <dt className="text-xs text-muted">Nama</dt>
                  <dd className="mt-0.5 break-words font-bold text-ink">
                    {session.user.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Email</dt>
                  <dd className="mt-0.5 break-all font-medium text-ink">
                    {session.user.email}
                  </dd>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="text-xs text-muted">Peran</dt>
                  <dd className="rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold text-brand">
                    {roleLabel}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="border-t border-line pt-5">
              <h2 className="mb-3 text-[16px] font-bold text-ink">
                Status keamanan
              </h2>
              <div className="space-y-3">
                <StatusRow
                  label="Verifikasi email"
                  icon={<I.Mail />}
                  good={session.user.emailVerified}
                />
                <StatusRow
                  label="MFA sesi aktif"
                  icon={<I.Shield />}
                  good={assured}
                />
              </div>
            </div>
          </section>

          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            {canManagePasskeys ? (
              <PasskeyManager
                initialPasskeys={devices}
                recentMfa={recentMfa}
                signInEnabled={process.env.ENABLE_PASSKEY_SIGNIN === "YES"}
              />
            ) : (
              <section className={`${panel} flex-1 p-5 sm:p-6`}>
                <div className="flex items-center gap-3">
                  <RoundIcon>
                    <I.Lock />
                  </RoundIcon>
                  <h2 className="text-[17px] font-bold text-ink">Passkey</h2>
                </div>
                <p className="mt-4 text-[13px] text-muted">
                  Masuk kembali dengan TOTP untuk mengelola Passkey.
                </p>
              </section>
            )}

            <section
              className={`${panel} flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6`}
              aria-label="Keluar dari akun"
            >
              <div className="flex items-center gap-3">
                <RoundIcon>
                  <I.LogOut />
                </RoundIcon>
                <h2 className="text-sm font-bold text-ink">Keluar dari akun</h2>
              </div>
              <LogoutButton />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
