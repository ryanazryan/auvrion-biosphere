import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActivationForm } from "@/components/auth/activation-form";
import { AuthLayout } from "@/components/auth/auth-layout";
import { onboardingEnabled } from "@/server/account-activation/onboarding-environment";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Aktivasi Akun | Auvrion Biosphere",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function ActivationPage() {
  if (!onboardingEnabled(process.env)) notFound();
  return (
    <AuthLayout>
      <ActivationForm />
    </AuthLayout>
  );
}
