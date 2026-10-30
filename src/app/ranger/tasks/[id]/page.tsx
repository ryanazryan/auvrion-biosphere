import Link from "next/link";
import { notFound } from "next/navigation";
import { RangerTaskEvidenceSummary } from "@/components/ranger/RangerTaskEvidenceSummary";
import { RangerTaskLocationMap } from "@/components/ranger/RangerTaskLocationMap";
import {
  formattedDate,
  Heading,
  RangerStatus,
  SafetyPanel,
  taskCode,
  taskZone,
} from "@/components/ranger/RangerViews";
import { TaskActionPanel } from "@/components/ranger/TaskActionPanel";
import { getAssignedCaseObservations } from "@/server/ranger/ranger-case-observations";
import { isTaskUuid } from "@/server/ranger/ranger-task-query";
import { getMyRangerTask } from "@/server/ranger/ranger-task-service";
import { findRangerWorkspaceAccess } from "@/server/ranger/ranger-workspace";

export const dynamic = "force-dynamic";
const STEPS = [
  "Ditugaskan",
  "Diterima",
  "Di lapangan",
  "Diajukan",
  "Dievaluasi",
];
const currentStep: Record<string, number> = {
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
  const observations = await getAssignedCaseObservations(
    access.organizationId,
    access.userId,
    id,
  );
  if (!observations) notFound();
  const step = currentStep[task.status] ?? 1;
  const parsedZone = taskZone(task.instructions);
  const instructionText = task.instructions
    ?.replace(/^Operational zone:\s*[^\r\n]+\s*/m, "")
    .trim();

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1380px] space-y-4 pb-12">
      <Link
        href="/ranger/tasks"
        className="inline-flex items-center gap-2 text-xs font-semibold text-brand hover:underline"
      >
        <span aria-hidden="true">←</span> Kembali ke Tugas Saya
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Heading
            title={task.title}
            eyebrow={`${taskCode(task.id)} · Verifikasi operasional`}
            note={`Ditugaskan ${formattedDate(task.assignedAt)} WITA`}
          />
        </div>
        <RangerStatus status={task.status} />
      </div>
      <section
        aria-label="Progres tugas"
        className="rounded-xl border border-line bg-white p-3 sm:p-4"
      >
        <p className="mb-2 text-xs font-medium text-muted">
          {STEPS[step - 1]} · Tahap {step} dari 5
        </p>
        <ol className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-label={`${label}${i < step ? ", tercapai" : ""}`}
            >
              <div
                className={`h-1.5 rounded-full ${i < step ? "bg-brand" : "bg-line"}`}
              />
              <span className="mt-1 hidden text-[11px] text-muted md:block">
                {label}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-4">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Area penugasan
              </p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {parsedZone ?? "Mengambil lokasi dari penugasan"}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Observasi terkait
              </p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {observations.length} observasi
              </p>
              <p className="mt-1 text-xs text-muted">
                {observations.some(
                  (item) => item.evidence?.audioRecordings.length,
                )
                  ? "Bukti WAV tersedia"
                  : "Belum ada bukti audio LISTEN"}
              </p>
            </div>
          </section>
          <RangerTaskLocationMap
            organizationId={access.organizationId}
            taskId={task.id}
          />
          <RangerTaskEvidenceSummary
            observations={observations}
            taskId={task.id}
            organizationId={access.organizationId}
          />
          <section className="rounded-xl border border-line bg-white">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">
                Instruksi Supervisor
              </h2>
            </div>
            <p className="whitespace-pre-wrap px-4 py-3 text-[13px] leading-6 text-fg">
              {instructionText ||
                "Instruksi belum tersedia. Hubungi Supervisor."}
            </p>
            <details className="border-t border-line px-4 py-3">
              <summary className="cursor-pointer text-xs font-semibold text-brand">
                Buka arahan keselamatan
              </summary>
              <div className="mt-3">
                <SafetyPanel safety={task.safetyNotes} />
              </div>
            </details>
          </section>
          <details className="rounded-xl border border-line bg-white px-4 py-3">
            <summary className="cursor-pointer text-xs font-semibold text-brand">
              Referensi dan detail teknis tugas
            </summary>
            <dl className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
              <div>
                <dt>Case</dt>
                <dd className="mt-1 break-all font-mono">{task.caseId}</dd>
              </div>
              <div>
                <dt>Task</dt>
                <dd className="mt-1 break-all font-mono">{task.id}</dd>
              </div>
              <div>
                <dt>Versi</dt>
                <dd className="mt-1">{task.version}</dd>
              </div>
              <div>
                <dt>Ditugaskan</dt>
                <dd className="mt-1">{formattedDate(task.assignedAt)} WITA</dd>
              </div>
            </dl>
          </details>
        </div>
        <aside className="min-w-0 space-y-3 lg:sticky lg:top-24">
          <section className="space-y-3 rounded-xl border border-line bg-white p-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">
                Tindakan Ranger
              </h2>
              <p className="mt-1 text-xs text-muted">
                Gunakan bukti dan peta sebagai dasar keputusan Anda.
              </p>
            </div>
            {task.status === "in_progress" && (
              <Link
                href={`/ranger/tasks/${task.id}/findings/new`}
                className="block rounded-lg bg-brand-50 px-3 py-3 text-center text-sm font-semibold text-brand"
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
              className="block rounded-lg border border-line bg-white px-3 py-3 text-center text-sm font-semibold text-brand"
            >
              Riwayat audit & temuan →
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
