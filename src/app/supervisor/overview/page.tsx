import Link from "next/link";
import {
  dateTime,
  Empty,
  Metric,
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
export default async function SupervisorOverview() {
  const a = await findWorkspaceAccess("supervisor");
  if (!a.allowed) return null;
  const [cases, tasks] = await Promise.all([
    listWorkspaceCases(a.organizationId),
    listWorkspaceTasks(a.organizationId),
  ]);
  const waiting = cases.filter((c) => c.status === "awaiting_decision");
  const active = tasks.filter((t) =>
    ["assigned", "accepted", "in_progress", "blocked", "submitted"].includes(
      t.status,
    ),
  );
  return (
    <>
      <PageHeading
        title="Ringkasan operasi"
        desc="Apa yang menunggu keputusan, penugasan aktif, serta pekerjaan lapangan yang memerlukan perhatian."
        action={
          <NavButton href="/supervisor/decisions">
            Buka antrean keputusan →
          </NavButton>
        }
      />
      <section
        aria-label="Postur operasi"
        className="mb-6 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-line gap-px sm:grid-cols-3 xl:grid-cols-6"
      >
        <Metric
          lead
          label="Menunggu keputusan"
          value={waiting.length}
          href="/supervisor/decisions"
          note="Dari Operator"
        />
        <Metric
          label="Dipantau"
          value={cases.filter((c) => c.status === "monitoring").length}
          href="/supervisor/decisions?view=monitoring"
          note="Tanpa Ranger"
        />
        <Metric
          label="Tugas aktif"
          value={active.length}
          href="/supervisor/tasks"
          note="Sedang ditugaskan"
        />
        <Metric
          label="Terblokir"
          value={tasks.filter((t) => t.status === "blocked").length}
          href="/supervisor/tasks?status=blocked"
          note="Butuh evaluasi"
        />
        <Metric
          label="Laporan masuk"
          value={tasks.filter((t) => t.status === "submitted").length}
          href="/supervisor/tasks?status=submitted"
          note="Read-only"
        />
        <Metric
          label="Hasil perlu ditinjau"
          value={
            tasks.filter(
              (t) => t.status === "submitted" || t.status === "completed",
            ).length
          }
          href="/supervisor/outcomes"
          note="Belum closing"
        />
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Panel
            title="Antrean keputusan"
            aside={
              <Link
                className="text-xs font-semibold text-brand"
                href="/supervisor/decisions"
              >
                Lihat semua →
              </Link>
            }
          >
            {!waiting.length ? (
              <Empty text="Tidak ada Case yang menunggu keputusan." />
            ) : (
              <ul className="divide-y divide-line">
                {waiting.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/supervisor/decisions/${c.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-ink">
                          {c.title}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {shortId(c.id)} · v{c.version} ·{" "}
                          {dateTime(c.createdAt)}
                        </span>
                      </span>
                      <StatusChip status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel
            title="Aktivitas Ranger"
            aside={
              <Link
                className="text-xs font-semibold text-brand"
                href="/supervisor/tasks"
              >
                Semua tugas →
              </Link>
            }
          >
            {!active.length ? (
              <Empty text="Belum ada tugas lapangan aktif." />
            ) : (
              <ul className="divide-y divide-line">
                {active.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/supervisor/tasks/${t.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-ink">
                          {t.title}
                        </span>
                        <span className="block text-xs text-muted">
                          {t.rangerName ?? "Tanpa Ranger aktif"} ·{" "}
                          {shortId(t.id)}
                        </span>
                      </span>
                      <StatusChip status={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <aside className="space-y-5">
          <Panel title="Perlu perhatian">
            <div className="space-y-3 p-4 text-[13px] text-muted">
              <p>
                <strong className="text-ink">{waiting.length}</strong> Case
                menunggu keputusan Supervisor.
              </p>
              <p>
                <strong className="text-ink">
                  {tasks.filter((t) => t.status === "blocked").length}
                </strong>{" "}
                tugas terblokir.
              </p>
              <p>
                Indikator bersifat baca-saja; tidak memicu eskalasi otomatis.
              </p>
            </div>
          </Panel>
          <Panel title="Aturan keputusan V1">
            <div className="space-y-2 p-4 text-[13px] leading-6 text-muted">
              <p>AB-TR-012: Monitoring dengan alasan.</p>
              <p>
                AB-TR-013: Assign Ranger yang aktif dengan instruksi dan
                keselamatan.
              </p>
              <p>
                Closure, escalation, dan Task review belum memperoleh izin
                transisi.
              </p>
            </div>
          </Panel>
        </aside>
      </div>
      <p className="mt-4 text-xs text-muted">
        Daftar dibatasi 100 Case dan 100 Task terbaru per organisasi. Angka
        merupakan ringkasan data yang dimuat, bukan agregat seluruh histori.
      </p>
    </>
  );
}
