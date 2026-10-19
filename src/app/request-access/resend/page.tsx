import type { Metadata } from "next";

import { AccessVerificationRequestForm } from "@/components/auth/access-verification-request-form";
import { AuthLayout } from "@/components/auth/auth-layout";

export const metadata: Metadata = {
  title: "Verifikasi Email | Auvrion Biosphere",
};

export default function ResendVerificationPage() {
  return (
    <AuthLayout>
      <AccessVerificationRequestForm />
    </AuthLayout>
  );
}
