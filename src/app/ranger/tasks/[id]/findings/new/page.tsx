import { notFound } from "next/navigation";
import { Heading } from "@/components/ranger/RangerViews";
import { isTaskUuid } from "@/server/ranger/ranger-task-query";
import { getMyRangerTask } from "@/server/ranger/ranger-task-service";
import { findRangerWorkspaceAccess } from "@/server/ranger/ranger-workspace";
export const dynamic = "force-dynamic";
export default async function NewRangerFinding({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isTaskUuid(id)) notFound();
  const access = await findRangerWorkspaceAccess();
  if (!access.allowed) return null;
  const task = await getMyRangerTask(access.organizationId, access.userId, id);
  if (!task) notFound();
  return (
    <>
      <Heading title="Catat Temuan" />
      <div className="rounded-xl border border-warn/30 bg-warn-50 p-5 text-sm">
        Pencatatan temuan belum dibuka. Akses pribadi dan bukti perlu
        diverifikasi pada tahap berikutnya. Tidak ada data yang disimpan.
      </div>
    </>
  );
}
