import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskActionPanel } from "@/components/ranger/TaskActionPanel";
import { TaskPhotoGallery } from "@/components/shared/TaskPhotoGallery";
import {
  dateTime,
  NavButton,
  PageHeading,
  Panel,
  StatusChip,
  shortId,
} from "@/components/supervisor/SupervisorElements";
import { TaskActivityFeed } from "@/components/supervisor/TaskActivityFeed";
import { isUuid } from "@/server/workflow/approved-case-policy";
import {
  findWorkspaceAccess,
  getWorkspaceTask,
} from "@/server/workflow/workspace-queries";

export const dynamic = "force-dynamic";
export default async function SupervisorTaskDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const a = await findWorkspaceAccess("supervisor");
  if (!a.allowed) return null;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await getWorkspaceTask(a.organizationId, id);
  if (!data) notFound();
  const { task: t } = data;
  return (
    <>
      <div className="mb-4">
        <Link
          className="text-xs font-semibold text-brand"
          href="/supervisor/tasks"
        >
          ← Kembali ke tugas
        </Link>
      </div>
      <PageHeading
        title={t.title}
        desc={`Task ${shortId(t.id)} · versi ${t.version} · dibuat ${dateTime(t.createdAt)}`}
        action={<StatusChip status={t.status} />}
      />
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel title="Instruksi & keselamatan">
            <div className="space-y-5 p-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase text-muted">
                  Instruksi
                </p>
                <p className="mt-2 whitespace-pre-wrap leading-7">
                  {t.instructions ?? "Tidak tersedia"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted">
                  Catatan keselamatan
                </p>
                <p className="mt-2 whitespace-pre-wrap leading-7">
                  {t.safetyNotes ?? "Tidak tersedia"}
                </p>
              </div>
            </div>
          </Panel>
          <TaskActivityFeed taskId={t.id} organizationId={a.organizationId} />
          <TaskPhotoGallery taskId={t.id} organizationId={a.organizationId} />
        </div>
        <aside className="space-y-4">
          <Panel title="Penugasan">
            <div className="space-y-3 p-4 text-[13px]">
              <p>
                <span className="text-muted">Ranger:</span>{" "}
                <strong className="text-ink">
                  {t.rangerName ?? "Tidak ada assignment aktif"}
                </strong>
              </p>
              <p>
                <span className="text-muted">Diberikan:</span>{" "}
                {dateTime(t.assignedAt)}
              </p>
              <p>
                <span className="text-muted">Case:</span> {shortId(t.caseId)}
              </p>
              <NavButton muted href={`/supervisor/decisions/${t.caseId}`}>
                Lihat Case →
              </NavButton>
            </div>
          </Panel>
          <TaskActionPanel
            key={`${t.id}:${t.version}`}
            taskId={t.id}
            organizationId={a.organizationId}
            status={t.status}
            version={t.version}
            actor="supervisor"
          />
        </aside>
      </div>
    </>
  );
}
