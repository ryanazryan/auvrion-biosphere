import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActivationForm } from "@/components/auth/activation-form";
import { AuthLayout } from "@/components/auth/auth-layout";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Aktivasi Akun | Auvrion Biosphere",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function ActivationPage() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  )
    notFound();
  return (
    <AuthLayout>
      <ActivationForm />
    </AuthLayout>
  );
}
