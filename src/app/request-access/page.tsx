import type { Metadata } from "next";
import { AccessRequestForm } from "@/components/auth/access-request-form";
import { AuthLayout } from "@/components/auth/auth-layout";

export const metadata: Metadata = {
  title: "Ajukan Akses | Auvrion Biosphere",
};

export default function RequestAccessPage() {
  return (
    <AuthLayout>
      <AccessRequestForm />
    </AuthLayout>
  );
}
