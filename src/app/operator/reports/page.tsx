import Link from "next/link";
import { ObservationReportControls } from "@/components/operator/ObservationReportControls";
import { OperatorLayout } from "@/figma-operator/components/operator/OperatorLayout";
import { findWorkspaceAccess } from "@/server/workflow/workspace-queries";

export const dynamic = "force-dynamic";

export default async function OperatorReportsPage() {
  const access = await findWorkspaceAccess("operator");
  if (!access.allowed) return null;
  return (
    <OperatorLayout
      path="/operator/observations"
      crumbs={[{ label: "Observasi" }, { label: "Laporan" }]}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">Laporan Observasi</h1>
        <Link
          href="/operator/observations"
          className="text-sm font-medium text-brand hover:underline"
        >
          Kembali ke observasi
        </Link>
      </div>
      <ObservationReportControls />
    </OperatorLayout>
  );
}
