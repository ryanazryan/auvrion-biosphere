import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { OperatorProvider } from "@/figma-operator/operator-context";
import { getCurrentSession } from "@/server/auth/session";
import { checkAccountAccess } from "@/server/authorization/account-access";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import { organizations, roleGrants } from "@/server/db/grants-schema";
import { observationSources } from "@/server/db/observation-domain-schema";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Workspace Operator | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

function Denied({ reason }: { reason: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-5">
      <section className="max-w-md rounded-md border border-line bg-surface p-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">
          Auvrion Biosphere
        </p>
        <h1 className="mt-3 text-xl font-semibold text-ink">
          Workspace Operator tidak tersedia
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Periksa status akun, hak akses Operator, dan verifikasi MFA Anda.
          Akses tidak dapat diberikan hanya dari navigasi browser.
        </p>
        <p className="mt-4 text-xs text-muted">Kode: {reason}</p>
        <a
          href="/"
          className="mt-5 inline-flex rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-brand hover:bg-brand-50"
        >
          Kembali ke beranda
        </a>
      </section>
    </main>
  );
}

export default async function OperatorRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  const account = await checkAccountAccess();
  if (!account.allowed) {
    if (account.status === 401) redirect("/login");
    return <Denied reason={account.reason} />;
  }
  const db = getDb();
  // First deterministic active Operator organization. Multi-organization picker is a future capability.
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(roleGrants)
    .innerJoin(organizations, eq(roleGrants.organizationId, organizations.id))
    .where(
      and(
        eq(roleGrants.userId, account.userId),
        eq(roleGrants.role, "operator"),
        isNull(roleGrants.revokedAt),
      ),
    )
    .orderBy(asc(organizations.name))
    .limit(1);
  if (!org) return <Denied reason="ROLE_OR_SCOPE_DENIED" />;
  const access = await checkOperationalAccess(org.id, "operator");
  if (!access.allowed) {
    if (access.status === 401) redirect("/login");
    return <Denied reason={access.reason} />;
  }
  const session = await getCurrentSession();
  if (!session || session.user.id !== access.userId) redirect("/login");
  const sources = await db
    .select({
      id: observationSources.id,
      code: observationSources.code,
      name: observationSources.label,
      active: observationSources.isActive,
    })
    .from(observationSources)
    .where(
      and(
        eq(observationSources.organizationId, org.id),
        eq(observationSources.kind, "manual"),
        eq(observationSources.isActive, true),
        ne(observationSources.code, "WC009-MANUAL-DEV"),
      ),
    )
    .orderBy(asc(observationSources.code));
  const name = session.user.name?.trim() || session.user.email;
  const initials = name
    .split(/\s+/)
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <OperatorProvider
      value={{
        operator: {
          name,
          initials,
          email: session.user.email,
          organizationId: org.id,
          orgName: org.name,
        },
        sources: sources.map((s) => ({
          ...s,
          acquisitionMethod: "Pencatatan manual",
        })),
      }}
    >
      {children}
    </OperatorProvider>
  );
}
