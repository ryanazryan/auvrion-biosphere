import { notFound } from "next/navigation";
import type { Role } from "@/components/demo/role-demo-data";
import { RoleDemoFidelity } from "@/components/demo/role-demo-v3";

export const metadata = {
  title: "Workspace | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

export default async function DemoRolePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  if (role !== "operator" && role !== "ranger" && role !== "supervisor")
    notFound();
  return <RoleDemoFidelity role={role as Role} />;
}
