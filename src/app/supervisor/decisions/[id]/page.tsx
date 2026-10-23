import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseActionForm } from "@/components/supervisor/CaseActionForm";
import {
  dateTime,
  Empty,
  NavButton,
  PageHeading,
  Panel,
  StatusChip,
  shortId,
} from "@/components/supervisor/SupervisorElements";
import { isUuid } from "@/server/workflow/approved-case-policy";
import {
  findWorkspaceAccess,
  getWorkspaceCase,
  listEligibleRangers,
  listWorkspaceZones,
} from "@/server/workflow/workspace-queries";

export const dynamic = "force-dynamic";
export default async function SupervisorCaseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const a = await findWorkspaceAccess("supervisor");
  if (!a.allowed) return null;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const detail = await getWorkspaceCase(a.organizationId, id);
  if (!detail) notFound();
  const { record: c, observations, events, tasks } = detail;
  const [rangers, zones] =
    c.status === "awaiting_decision"
      ? await Promise.all([
          listEligibleRangers(a.organizationId),
          listWorkspaceZones(a.organizationId),
        ])
      : [[], []];
  return (
    <>
      <div className="mb-4">
        <Link
          className="text-xs font-semibold text-brand"
          href="/supervisor/decisions"
        >
          ← Kembali ke antrean
        </Link>
      </div>
      <PageHeading
        title={c.title}
        desc={`Case ${shortId(c.id)} · versi ${c.version} · dibuat ${dateTime(c.createdAt)}`}
        action={<StatusChip status={c.status} />}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <Panel title={`Observasi terkait · ${observations.length}`}>
            {!observations.length ? (
              <Empty text="Tidak ada observasi aktif yang terkait. Mutasi akan ditolak oleh service." />
            ) : (
              <ul className="divide-y divide-line">
                {observations.map((o) => (
                  <li key={o.id} className="px-4 py-3">
                    <p className="text-sm font-semibold text-ink">
                      {o.domain === "biodiversity"
                        ? "Biodiversitas"
                        : "Risiko lingkungan"}{" "}
                      · {o.sourceCode}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Kualitas: {o.quality} · diterima {dateTime(o.receivedAt)}{" "}
                      · diamati {dateTime(o.observedAt)}
                    </p>
                    <p className="mt-1 text-xs text-muted">{o.linkReason}</p>
                    <p className="mt-1 text-xs text-muted">
                      Lokasi presisi tidak dibuka melalui workspace keputusan.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Riwayat transisi & alasan">
            {!events.length ? (
              <Empty text="Belum ada event transisi pada Case ini." />
            ) : (
              <ol className="divide-y divide-line">
                {events.map((e) => (
                  <li
                    key={`${e.toVersion}-${e.transitionId}`}
                    className="px-4 py-3"
                  >
                    <p className="text-[13px] font-semibold text-ink">
                      {e.transitionId} · {e.fromStatus} → {e.toStatus}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Versi {e.fromVersion} → {e.toVersion} ·{" "}
                      {dateTime(e.createdAt)}
                    </p>
                    <p className="mt-2 text-[13px] leading-6">{e.reason}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          {tasks.length > 0 && (
            <Panel title="Tugas terkait">
              <ul className="divide-y divide-line">
                {tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col items-start gap-2">
                      <p className="truncate text-[13px] font-semibold">
                        {t.title}
                      </p>
                      <StatusChip status={t.status} />
                    </div>
                    <NavButton muted href={`/supervisor/tasks/${t.id}`}>
                      Detail tugas →
                    </NavButton>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
        <aside>
          <Panel title="Keputusan Supervisor">
            <div className="p-4">
              {c.status === "awaiting_decision" ? (
                <CaseActionForm
                  key={`${c.id}:${c.version}`}
                  caseId={c.id}
                  organizationId={a.organizationId}
                  version={c.version}
                  status={c.status}
                  actorRole="supervisor"
                  rangers={rangers}
                  zones={zones}
                />
              ) : (
                <p className="text-[13px] leading-6 text-muted">
                  Case ini tidak sedang menunggu keputusan. Transisi yang tidak
                  disetujui dinonaktifkan.
                </p>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}
