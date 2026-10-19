import type { Metadata } from "next";

import { AccessEmailVerificationForm } from "@/components/auth/access-email-verification-form";
import { AuthLayout } from "@/components/auth/auth-layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verifikasi Email | Auvrion Biosphere",
  robots: {
    index: false,
    follow: false,
  },
  referrer: "no-referrer",
};

type PageProps = {
  searchParams: Promise<{
    token?: string | string[];
  }>;
};

export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const token = typeof params.token === "string" ? params.token : null;

  return (
    <AuthLayout>
      <AccessEmailVerificationForm token={token} />
    </AuthLayout>
  );
}
