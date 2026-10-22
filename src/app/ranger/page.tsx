import Link from "next/link";
import { RangerIcon } from "@/components/ranger/RangerIcons";
import {
  ACTIONABLE,
  formattedDate,
  Heading,
  InfoCard,
  SafetyPanel,
  TaskList,
  taskCode,
} from "@/components/ranger/RangerViews";
import { listMyRangerTasks } from "@/server/ranger/ranger-task-service";
import { findRangerWorkspaceAccess } from "@/server/ranger/ranger-workspace";

export const dynamic = "force-dynamic";

export default async function RangerHome() {
  const access = await findRangerWorkspaceAccess();
  if (!access.allowed) return null;
  const { items } = await listMyRangerTasks(
    access.organizationId,
    access.userId,
    50,
  );
  const needs = items.filter((task) => ACTIONABLE.includes(task.status));
  const blocked = items.filter((task) => task.status === "blocked");
  const waiting = items.filter((task) => task.status === "submitted");
  const now = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Makassar",
  }).format(new Date());
  const recent = [...items]
    .sort(
      (a, b) =>
        new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime(),
    )
    .slice(0, 4);

  return (
    <>
      <Heading
        title="Tugas hari ini"
        eyebrow={now}
        note={access.organizationName}
      />
      <div className="space-y-5">
        <SafetyPanel safety={null} />
        <section aria-labelledby="ranger-needs">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2
              id="ranger-needs"
              className="text-[15px] font-semibold text-ink"
            >
              Perlu tindakan Anda
            </h2>
            <Link
              href="/ranger/tasks"
              className="text-[13px] font-medium text-brand hover:underline"
            >
              Semua tugas
            </Link>
          </div>
          <TaskList tasks={needs.slice(0, 6)} />
        </section>
        <dl className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-lg border border-line bg-white text-center">
          <div className="p-3">
            <dt className="text-[11px] text-muted sm:text-xs">Terblokir</dt>
            <dd
              className={`mt-1 text-xl font-semibold tabular-nums ${blocked.length ? "text-danger" : "text-ink"}`}
            >
              {blocked.length}
            </dd>
          </div>
          <div className="p-3">
            <dt className="text-[11px] text-muted sm:text-xs">
              Menunggu evaluasi
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-ink">
              {waiting.length}
            </dd>
          </div>
          <div className="p-3">
            <dt className="text-[11px] text-muted sm:text-xs">
              Selesai & dibatalkan
            </dt>
            <dd className="mt-1 text-xl font-semibold text-muted">
              Belum tersedia
            </dd>
          </div>
        </dl>
        <InfoCard
          title="Aktivitas terbaru"
          icon={<RangerIcon name="clock" className="size-4 text-muted" />}
          action={
            <Link
              className="text-xs font-medium text-brand hover:underline"
              href="/ranger/history"
            >
              Riwayat lengkap
            </Link>
          }
        >
          {recent.length ? (
            <ol className="divide-y divide-line">
              {recent.map((task) => (
                <li key={task.id} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/ranger/tasks/${task.id}`}
                    className="flex items-start gap-3 hover:text-brand"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-muted">
                      <RangerIcon name="shield" className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {taskCode(task.id)} · Tugas ditugaskan kepada Ranger.
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {formattedDate(task.assignedAt)} WITA
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted">Belum ada aktivitas penugasan.</p>
          )}
        </InfoCard>
      </div>
    </>
  );
}
