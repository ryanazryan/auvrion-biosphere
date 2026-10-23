import Link from "next/link";
import { notFound } from "next/navigation";
import { RangerIcon } from "@/components/ranger/RangerIcons";
import {
  formattedDate,
  Heading,
  InfoCard,
  RangerStatus,
  SafetyPanel,
  taskCode,
  taskZone,
} from "@/components/ranger/RangerViews";
import { TaskActionPanel } from "@/components/ranger/TaskActionPanel";
import { isTaskUuid } from "@/server/ranger/ranger-task-query";
import { getMyRangerTask } from "@/server/ranger/ranger-task-service";
import { findRangerWorkspaceAccess } from "@/server/ranger/ranger-workspace";

export const dynamic = "force-dynamic";
const STEPS = [
  "Ditugaskan",
  "Diterima",
  "Di lapangan",
  "Diajukan",
  "Dievaluasi Supervisor",
];
const stepByStatus: Record<string, number> = {
  assigned: 1,
  accepted: 2,
  in_progress: 3,
  blocked: 3,
  submitted: 4,
  completed: 5,
  cancelled: 1,
};
export default async function RangerTaskDetail({
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
  const step = stepByStatus[task.status] ?? 1;
  const zone = taskZone(task.instructions);
  return (
    <>
      <Link
        href="/ranger/tasks"
        className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
      >
        <RangerIcon name="chevron-left" className="size-3.5" />
        Tugas Saya
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <Heading
          title={task.title}
          eyebrow={`${taskCode(task.id)} · Tugas lapangan`}
          note={`Ditugaskan ${formattedDate(task.assignedAt)} WITA`}
        />
        <RangerStatus status={task.status} />
      </div>
      <section
        aria-label="Tahap tugas"
        className="mb-5 rounded-lg border border-line bg-white p-3.5 sm:p-4"
      >
        <p className="mb-2 text-[13px] font-medium text-ink sm:hidden">
          {STEPS[step - 1]} · Tahap {step} dari {STEPS.length}
        </p>
        <ol className="grid grid-cols-5 gap-2.5">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-label={`${label}${i < step ? ", tercapai" : ""}`}
            >
              <div
                className={`h-1 rounded-full ${i < step ? "bg-brand" : "bg-line"}`}
              />
              <span className="mt-1.5 hidden text-[11px] text-muted sm:block">
                {label}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <div className="space-y-5">
        <SafetyPanel safety={task.safetyNotes} />
        <InfoCard
          title="Penugasan"
          icon={<RangerIcon name="file" className="size-4 text-muted" />}
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Area kerja</dt>
              <dd className="mt-1 font-medium">
                {zone ?? "Sesuai instruksi Supervisor"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Ditugaskan</dt>
              <dd className="mt-1">{formattedDate(task.assignedAt)} WITA</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Referensi Case</dt>
              <dd className="mt-1 font-mono text-xs">
                {task.caseId.slice(0, 8)}…
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Versi</dt>
              <dd className="mt-1 tabular-nums">{task.version}</dd>
            </div>
          </dl>
        </InfoCard>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
          <div className="space-y-5">
            <InfoCard title="Instruksi Supervisor">
              <p className="whitespace-pre-wrap">
                {task.instructions?.trim() ||
                  "Instruksi belum tersedia. Hubungi Supervisor."}
              </p>
            </InfoCard>
            <InfoCard title="Bukti dan observasi">
              <div className="rounded-md border border-line bg-bg px-3 py-3 text-xs text-muted">
                <RangerIcon
                  name="lock"
                  className="mr-2 inline size-4 align-middle"
                />
                Berkas privat dan lokasi presisi belum dapat ditampilkan pada
                slice ini.
              </div>
            </InfoCard>
            <InfoCard
              title="Riwayat tugas"
              icon={<RangerIcon name="clock" className="size-4 text-muted" />}
            >
              <ol className="border-l border-line pl-4">
                <li>
                  <span className="block text-[13px] font-medium">
                    Tugas ditugaskan kepada Anda.
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {formattedDate(task.assignedAt)} WITA
                  </span>
                </li>
              </ol>
            </InfoCard>
          </div>
          <aside>
            <div className="space-y-3">
              {task.status === "in_progress" && (
                <Link
                  href={`/ranger/tasks/${task.id}/findings/new`}
                  className="block rounded-md bg-brand-50 px-4 py-3 text-center text-sm font-semibold text-brand"
                >
                  Catat temuan lapangan →
                </Link>
              )}
              <TaskActionPanel
                key={`${task.id}:${task.version}`}
                taskId={task.id}
                organizationId={access.organizationId}
                status={task.status}
                version={task.version}
                actor="ranger"
              />
              <Link
                href={`/ranger/tasks/${task.id}/history`}
                className="block rounded-md border border-line bg-white px-4 py-3 text-center text-sm font-semibold text-brand"
              >
                Lihat audit & temuan →
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
