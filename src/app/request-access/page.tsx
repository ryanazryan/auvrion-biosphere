import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AccessRequestForm } from "@/components/auth/access-request-form";
import { AuthLayout } from "@/components/auth/auth-layout";
import {
  STATUS_COOKIE_NAME,
  verifyStatusSessionValue,
} from "@/server/access-status/tokens";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ajukan Akses | Auvrion Biosphere",
};

export default async function RequestAccessPage() {
  const cookieStore = await cookies();

  const applicationId = verifyStatusSessionValue(
    cookieStore.get(STATUS_COOKIE_NAME)?.value,
  );

  // Jika browser memiliki sesi status yang sah,
  // tidak perlu menampilkan formulir pengajuan ulang.
  if (applicationId) {
    redirect("/request-access/status");
  }

  return (
    <AuthLayout>
      <AccessRequestForm />
    </AuthLayout>
  );
}
