import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { RangerPhotoUpload } from "@/components/ranger/RangerPhotoUpload";
import { formattedDate, Heading } from "@/components/ranger/RangerViews";
import { TaskPhotoGallery } from "@/components/shared/TaskPhotoGallery";
import { getDb } from "@/server/db";
import {
  taskFindings,
  taskTransitionEvents,
} from "@/server/db/operations-domain-schema";
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
  const [events, findings] = await Promise.all([
    getDb()
      .select({
        id: taskTransitionEvents.id,
        transitionId: taskTransitionEvents.transitionId,
        fromStatus: taskTransitionEvents.fromStatus,
        toStatus: taskTransitionEvents.toStatus,
        reason: taskTransitionEvents.reason,
        createdAt: taskTransitionEvents.createdAt,
      })
      .from(taskTransitionEvents)
      .where(
        and(
          eq(taskTransitionEvents.taskId, id),
          eq(taskTransitionEvents.organizationId, access.organizationId),
        ),
      )
      .orderBy(asc(taskTransitionEvents.createdAt)),
    getDb()
      .select({
        id: taskFindings.id,
        summary: taskFindings.summary,
        authorId: taskFindings.authorUserId,
        createdAt: taskFindings.createdAt,
      })
      .from(taskFindings)
      .where(
        and(
          eq(taskFindings.taskId, id),
          eq(taskFindings.organizationId, access.organizationId),
        ),
      )
      .orderBy(asc(taskFindings.createdAt)),
  ]);
  return (
    <>
      <Heading title="Riwayat Tugas" note={task.title} />
      <ol className="space-y-3">
        <li className="rounded-lg border border-line bg-white p-4 text-sm">
          <p className="font-medium">Tugas diberikan kepada Ranger</p>
          <p className="mt-1 text-xs text-muted">
            {formattedDate(task.assignedAt)} WITA
          </p>
        </li>
        {events.map((event) => (
          <li
            key={event.id}
            className="rounded-lg border border-line bg-white p-4 text-sm"
          >
            <p className="font-medium">
              {event.transitionId} · {event.fromStatus} → {event.toStatus}
            </p>
            <p className="mt-2 whitespace-pre-wrap">{event.reason}</p>
            <p className="mt-1 text-xs text-muted">
              {formattedDate(event.createdAt)} WITA
            </p>
          </li>
        ))}
      </ol>
      <section className="mt-5 rounded-lg border border-line bg-white p-4">
        <h2 className="text-sm font-semibold">
          Temuan tersimpan · {findings.length}
        </h2>
        {findings.map((finding) => (
          <div
            key={finding.id}
            className="mt-3 border-t border-line pt-3 text-sm"
          >
            <p className="whitespace-pre-wrap">{finding.summary}</p>
            <p className="mt-1 text-xs text-muted">
              {formattedDate(finding.createdAt)} WITA
            </p>
            {task.status === "in_progress" &&
              finding.authorId === access.userId && (
                <RangerPhotoUpload
                  taskId={id}
                  organizationId={access.organizationId}
                  findingId={finding.id}
                />
              )}
          </div>
        ))}
      </section>
      <div className="mt-5">
        <TaskPhotoGallery taskId={id} organizationId={access.organizationId} />
      </div>
    </>
  );
}
