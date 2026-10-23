import { RangerTaskBoard } from "@/components/ranger/RangerTaskBoard";
import { Heading } from "@/components/ranger/RangerViews";
import { listMyRangerTasks } from "@/server/ranger/ranger-task-service";
import { findRangerWorkspaceAccess } from "@/server/ranger/ranger-workspace";

export const dynamic = "force-dynamic";
export default async function RangerTasksPage() {
  const access = await findRangerWorkspaceAccess();
  if (!access.allowed) return null;
  const { items } = await listMyRangerTasks(
    access.organizationId,
    access.userId,
    50,
  );
  return (
    <>
      <Heading title="Tugas Saya" />
      <RangerTaskBoard tasks={items} />
    </>
  );
}
