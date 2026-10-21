import Link from "next/link";
import {
  dateTime,
  Empty,
  PageHeading,
  Panel,
  ReadOnlyNote,
  StatusChip,
  shortId,
} from "@/components/supervisor/SupervisorElements";
import {
  findWorkspaceAccess,
  listWorkspaceCases,
  listWorkspaceTasks,
} from "@/server/workflow/workspace-queries";

export const dynamic = "force-dynamic";
export default async function SupervisorOutcomes() {
  const a = await findWorkspaceAccess("supervisor");
  if (!a.allowed) return null;
  const [cases, tasks] = await Promise.all([
    listWorkspaceCases(a.organizationId),
    listWorkspaceTasks(a.organizationId),
  ]);
  const submitted = tasks.filter((t) =>
    ["submitted", "completed"].includes(t.status),
  );
  return (
    <>
      <PageHeading
        title="Hasil & riwayat"
        desc="Tinjau laporan Ranger dan keputusan Case tanpa menganggap status Submitted sebagai Completed atau Closed."
      />
      <ReadOnlyNote>
        Registrasi outcome (Confirmed / Not Confirmed / Insufficient Evidence),
        rework, completion, dan closure belum disahkan untuk V1. Tidak ada
        tombol mutasi atau penilaian otomatis dari AI.
      </ReadOnlyNote>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title={`Laporan tugas · ${submitted.length}`}>
          {!submitted.length ? (
            <Empty text="Belum ada laporan tugas yang perlu ditinjau." />
          ) : (
            <ul className="divide-y divide-line">
              {submitted.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/supervisor/tasks/${t.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink">
                        {t.title}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {t.rangerName ?? "Ranger tidak aktif"} ·{" "}
                        {dateTime(t.createdAt)}
                      </p>
                    </div>
                    <StatusChip status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Riwayat status Case">
          {!cases.length ? (
            <Empty text="Belum ada Case." />
          ) : (
            <ul className="divide-y divide-line">
              {cases
                .filter((c) => ["monitoring", "assigned"].includes(c.status))
                .map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/supervisor/decisions/${c.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-ink">
                          {c.title}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {shortId(c.id)} · v{c.version}
                        </p>
                      </div>
                      <StatusChip status={c.status} />
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
