import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthLayout } from "@/components/auth/auth-layout";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { passwordRecoveryEnabled } from "@/server/auth/password-reset-policy";

export const metadata: Metadata = {
  title: "Pulihkan Kata Sandi | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  if (!passwordRecoveryEnabled(process.env)) notFound();
  return (
    <AuthLayout>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
