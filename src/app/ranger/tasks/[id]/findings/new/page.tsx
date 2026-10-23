import { notFound } from "next/navigation";
import { RangerFindingForm } from "@/components/ranger/RangerFindingForm";
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
      <Heading title="Catat Temuan" note={task.title} />
      {task.status === "in_progress" ? (
        <RangerFindingForm
          taskId={task.id}
          organizationId={access.organizationId}
        />
      ) : (
        <p className="rounded-lg border border-line bg-white p-5 text-sm text-muted">
          Temuan hanya dapat dicatat saat tugas berada pada status Di lapangan.
        </p>
      )}
    </>
  );
}
