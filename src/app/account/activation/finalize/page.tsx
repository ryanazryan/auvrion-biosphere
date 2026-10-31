import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ActivationFinalization } from "@/components/auth/activation-finalization";
import { AuthLayout } from "@/components/auth/auth-layout";
import { onboardingEnabled } from "@/server/account-activation/onboarding-environment";
import { getCurrentSession } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { userAccess } from "@/server/db/access-schema";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Selesaikan Aktivasi | Auvrion Biosphere",
  robots: { index: false, follow: false },
};
export default async function FinalizeActivationPage() {
  if (!onboardingEnabled(process.env)) {
    notFound();
  }
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const [access] = await getDb()
    .select({ status: userAccess.status })
    .from(userAccess)
    .where(eq(userAccess.userId, current.user.id))
    .limit(1);
  if (access?.status === "active") redirect("/");
  return (
    <AuthLayout>
      <ActivationFinalization />
    </AuthLayout>
  );
}
