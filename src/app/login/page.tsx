import type { Metadata } from "next";

import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";
import { PasskeyLoginButton } from "@/components/auth/PasskeyLoginButton";

export const metadata: Metadata = {
  title: "Masuk | Auvrion Biosphere",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  return (
    <AuthLayout>
      {reason === "mfa-expired" && (
        <p
          role="status"
          className="mb-5 rounded-md border border-warn/25 bg-warn-50 p-3 text-sm text-ink"
        >
          Verifikasi keamanan telah berakhir. Login kembali dan selesaikan TOTP
          untuk melanjutkan.
        </p>
      )}
      <LoginForm />
      {process.env.ENABLE_PASSKEY_SIGNIN === "YES" && <PasskeyLoginButton />}
    </AuthLayout>
  );
}
