import Link from "next/link";
import {
  dateTime,
  Empty,
  PageHeading,
  Panel,
  StatusChip,
  shortId,
} from "@/components/supervisor/SupervisorElements";
import {
  findWorkspaceAccess,
  listWorkspaceTasks,
} from "@/server/workflow/workspace-queries";

export const dynamic = "force-dynamic";
const statuses = [
  "all",
  "assigned",
  "accepted",
  "in_progress",
  "blocked",
  "submitted",
  "completed",
  "cancelled",
];
export default async function SupervisorTasks({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const access = await findWorkspaceAccess("supervisor");
  if (!access.allowed) return null;
  const p = await searchParams;
  const selected = statuses.includes(p.status ?? "") ? p.status : "all";
  const all = await listWorkspaceTasks(access.organizationId);
  const filtered =
    selected === "all" ? all : all.filter((t) => t.status === selected);
  return (
    <>
      <PageHeading
        title="Tugas Ranger"
        desc="Pantau penugasan dan temuan lapangan dari data yang tersimpan. Mutasi status Task masih dikunci sampai AB-TR-024–033 disetujui."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/supervisor/tasks?status=${s}`}
            aria-current={s === selected ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-xs font-semibold ${s === selected ? "bg-brand text-white" : "border border-line bg-white text-muted hover:bg-bg"}`}
          >
            {s === "all" ? "Semua" : s.replaceAll("_", " ")}
          </Link>
        ))}
      </div>
      <Panel
        title={`Daftar tugas · ${filtered.length}`}
        aside={<span className="text-xs text-muted">Baca-saja</span>}
      >
        {!filtered.length ? (
          <Empty text="Belum ada tugas pada status ini." />
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/supervisor/tasks/${t.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 hover:bg-bg sm:flex-nowrap"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {t.title}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {shortId(t.id)} · Ranger:{" "}
                      {t.rangerName ?? "Tidak ada assignment aktif"} ·{" "}
                      {dateTime(t.assignedAt)}
                    </p>
                  </div>
                  <StatusChip status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
