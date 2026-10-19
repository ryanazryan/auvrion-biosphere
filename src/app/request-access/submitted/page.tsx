import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AccessRequestSubmitted } from "@/components/auth/access-request-submitted";
import { AuthLayout } from "@/components/auth/auth-layout";
import {
  STATUS_COOKIE_NAME,
  verifyStatusSessionValue,
} from "@/server/access-status/tokens";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Permohonan Diterima | Auvrion Biosphere",
};

export default async function RequestSubmittedPage() {
  const jar = await cookies();
  const existing = verifyStatusSessionValue(jar.get(STATUS_COOKIE_NAME)?.value);
  if (existing) redirect("/request-access/status");

  return (
    <AuthLayout>
      <AccessRequestSubmitted />
    </AuthLayout>
  );
}
