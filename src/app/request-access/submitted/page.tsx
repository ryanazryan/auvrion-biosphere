import type { Metadata } from "next";
import { AccessRequestSubmitted } from "@/components/auth/access-request-submitted";
import { AuthLayout } from "@/components/auth/auth-layout";

export const metadata: Metadata = {
  title: "Permohonan Diterima | Auvrion Biosphere",
};

export default function RequestSubmittedPage() {
  return (
    <AuthLayout>
      <AccessRequestSubmitted />
    </AuthLayout>
  );
}
