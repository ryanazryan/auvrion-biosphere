import { and, desc, eq, inArray } from "drizzle-orm";
import {
  type RangerHistoryEvent,
  RangerHistoryTabs,
} from "@/components/ranger/RangerHistoryTabs";
import { Heading } from "@/components/ranger/RangerViews";
import { getDb } from "@/server/db";
import {
  taskFindings,
  taskTransitionEvents,
} from "@/server/db/operations-domain-schema";
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
    const transitions = await getDb()
      .select({
        id: taskTransitionEvents.id,
        taskId: taskTransitionEvents.taskId,
        at: taskTransitionEvents.createdAt,
        code: taskTransitionEvents.transitionId,
        from: taskTransitionEvents.fromStatus,
        to: taskTransitionEvents.toStatus,
        reason: taskTransitionEvents.reason,
        actorId: taskTransitionEvents.actorUserId,
      })
      .from(taskTransitionEvents)
      .where(
        and(
          eq(taskTransitionEvents.organizationId, access.organizationId),
          inArray(taskTransitionEvents.taskId, ids),
        ),
      )
      .orderBy(desc(taskTransitionEvents.createdAt))
      .limit(100);
    for (const t of transitions)
      events.push({
        id: `transition:${t.id}`,
        taskId: t.taskId,
        title: `${t.code} · ${t.from} → ${t.to}`,
        at: t.at.toISOString(),
        actor: t.actorId === access.userId ? "mine" : "supervisor",
        detail: t.reason,
      });
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
