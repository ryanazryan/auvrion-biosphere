import { and, desc, eq, inArray } from "drizzle-orm";
import {
  type RangerHistoryEvent,
  RangerHistoryTabs,
} from "@/components/ranger/RangerHistoryTabs";
import { Heading } from "@/components/ranger/RangerViews";
import { getDb } from "@/server/db";
import { taskFindings } from "@/server/db/operations-domain-schema";
import { listMyRangerTasks } from "@/server/ranger/ranger-task-service";
import { findRangerWorkspaceAccess } from "@/server/ranger/ranger-workspace";
export const dynamic = "force-dynamic";
export default async function RangerHistory() {
  const access = await findRangerWorkspaceAccess();
  if (!access.allowed) return null;
  const { items } = await listMyRangerTasks(
    access.organizationId,
    access.userId,
    50,
  );
  const events: RangerHistoryEvent[] = items.map((t) => ({
    id: `assignment:${t.id}`,
    taskId: t.id,
    title: `${t.title}`,
    at: t.assignedAt.toISOString(),
    actor: "supervisor",
    detail: "Tugas dibuat dan dikirim ke Ranger.",
  }));
  // Read only Ranger-authored findings for tasks already proven visible by the
  // server's organization+active-assignment scoped query. No broad audit leak.
  const ids = items.map((t) => t.id);
  if (ids.length) {
    const findings = await getDb()
      .select({
        id: taskFindings.id,
        taskId: taskFindings.taskId,
        at: taskFindings.createdAt,
        summary: taskFindings.summary,
      })
      .from(taskFindings)
      .where(
        and(
          eq(taskFindings.organizationId, access.organizationId),
          eq(taskFindings.authorUserId, access.userId),
          inArray(taskFindings.taskId, ids),
        ),
      )
      .orderBy(desc(taskFindings.createdAt))
      .limit(100);
    for (const f of findings)
      events.push({
        id: `finding:${f.id}`,
        taskId: f.taskId,
        title: "Temuan lapangan dicatat",
        at: f.at.toISOString(),
        actor: "mine",
        detail: f.summary,
      });
  }
  return (
    <>
      <Heading title="Riwayat" />
      <RangerHistoryTabs events={events} />
    </>
  );
}
