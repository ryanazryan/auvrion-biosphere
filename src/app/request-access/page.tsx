import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AccessRequestForm } from "@/components/auth/access-request-form";
import { AuthLayout } from "@/components/auth/auth-layout";
import {
  STATUS_COOKIE_NAME,
  verifyStatusSessionValue,
} from "@/server/access-status/tokens";
import { getDb } from "@/server/db";
import { accessApplications } from "@/server/db/access-schema";

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
    // A signed cookie may outlive its application after local demo cleanup.
    // Redirect only when the associated database record still exists.
    const [application] = await getDb()
      .select({ id: accessApplications.id })
      .from(accessApplications)
      .where(eq(accessApplications.id, applicationId))
      .limit(1);
    if (application) redirect("/request-access/status");
  }

  return (
    <AuthLayout>
      <AccessRequestForm />
    </AuthLayout>
  );
}
