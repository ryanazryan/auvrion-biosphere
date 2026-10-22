import { notFound } from "next/navigation";
import { Heading } from "@/components/ranger/RangerViews";
import { isTaskUuid } from "@/server/ranger/ranger-task-query";
import { getMyRangerTask } from "@/server/ranger/ranger-task-service";
import { findRangerWorkspaceAccess } from "@/server/ranger/ranger-workspace";
export const dynamic = "force-dynamic";
export default async function RangerTaskHistory({
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
      <Heading title="Riwayat Tugas" note={task.title} />
      <p className="rounded-xl border border-line bg-white p-5 text-sm text-muted">
        Audit Task belum diaktifkan. Tidak ada aktivitas yang direkayasa.
      </p>
    </>
  );
}
