import Link from "next/link";
import {
  dateTime,
  Empty,
  NavButton,
  PageHeading,
  Panel,
  StatusChip,
  shortId,
} from "@/components/supervisor/SupervisorElements";
import {
  findWorkspaceAccess,
  listWorkspaceCases,
  listWorkspaceTasks,
} from "@/server/workflow/workspace-queries";

export const dynamic = "force-dynamic";
export default async function SupervisorAssignments() {
  const access = await findWorkspaceAccess("supervisor");
  if (!access.allowed) return null;
  const [cases, tasks] = await Promise.all([
    listWorkspaceCases(access.organizationId),
    listWorkspaceTasks(access.organizationId),
  ]);
  const ready = cases.filter((c) => c.status === "awaiting_decision");
  const assigned = tasks.filter((t) =>
    ["assigned", "accepted", "in_progress", "blocked", "submitted"].includes(
      t.status,
    ),
  );
  return (
    <>
      <PageHeading
        title="Penugasan Ranger"
        desc="Pilih Case yang sudah dikirim Operator, verifikasi Ranger aktif dan zona, lalu catat instruksi serta keselamatan melalui satu transaksi."
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={`Siap diputuskan · ${ready.length}`}>
          {!ready.length ? (
            <Empty text="Belum ada Case yang dapat ditugaskan." />
          ) : (
            <ul className="divide-y divide-line">
              {ready.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {c.title}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {shortId(c.id)} · v{c.version}
                    </p>
                  </div>
                  <NavButton href={`/supervisor/decisions/${c.id}`}>
                    Pilih tindakan
                  </NavButton>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title={`Penugasan berjalan · ${assigned.length}`}
          aside={
            <Link
              href="/supervisor/tasks"
              className="text-xs font-semibold text-brand"
            >
              Semua tugas →
            </Link>
          }
        >
          {!assigned.length ? (
            <Empty text="Belum ada penugasan aktif." />
          ) : (
            <ul className="divide-y divide-line">
              {assigned.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {t.title}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {t.rangerName ?? "Ranger tidak aktif"} ·{" "}
                      {dateTime(t.assignedAt)}
                    </p>
                  </div>
                  <Link
                    className="text-xs font-semibold text-brand"
                    href={`/supervisor/tasks/${t.id}`}
                  >
                    <StatusChip status={t.status} /> →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
