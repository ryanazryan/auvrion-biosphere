import type { Metadata } from "next";

import { AuthLayout } from "@/components/auth/auth-layout";
import { TwoFactorForm } from "@/components/auth/two-factor-form";

export const metadata: Metadata = {
  title: "Verifikasi Dua Faktor | Auvrion Biosphere",
};

export default function TwoFactorPage() {
  return (
    <AuthLayout>
      <TwoFactorForm />
    </AuthLayout>
  );
}
