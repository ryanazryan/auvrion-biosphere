import type { Metadata } from "next";

import { AccessStatusLinkConfirm } from "@/components/auth/access-status-link-confirm";
import { AuthLayout } from "@/components/auth/auth-layout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Konfirmasi Status | Auvrion Biosphere",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { searchParams: Promise<{ token?: string | string[] }> };

export default async function StatusVerifyPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <AuthLayout>
      <AccessStatusLinkConfirm
        token={typeof params.token === "string" ? params.token : null}
      />
    </AuthLayout>
  );
}
