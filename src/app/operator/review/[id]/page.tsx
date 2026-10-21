import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseActionForm } from "@/components/supervisor/CaseActionForm";
import {
  dateTime,
  PageHeading,
  Panel,
  StatusChip,
  shortId,
} from "@/components/supervisor/SupervisorElements";
import { OperatorLayout } from "@/figma-operator/components/operator/OperatorLayout";
import { isUuid } from "@/server/workflow/approved-case-policy";
import {
  findWorkspaceAccess,
  getWorkspaceCase,
} from "@/server/workflow/workspace-queries";

export const dynamic = "force-dynamic";
export default async function OperatorReviewDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const a = await findWorkspaceAccess("operator");
  if (!a.allowed) return null;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await getWorkspaceCase(a.organizationId, id);
  if (!d) notFound();
  const c = d.record;
  return (
    <OperatorLayout
      path="/operator/review"
      crumbs={[
        { label: "Antrean Review", href: "/operator/review" },
        { label: "Detail Case" },
      ]}
    >
      <div className="mb-4">
        <Link
          className="text-xs font-semibold text-brand"
          href="/operator/review"
        >
          ← Kembali ke antrean
        </Link>
      </div>
      <PageHeading
        title={c.title}
        desc={`Case ${shortId(c.id)} · versi ${c.version} · ${dateTime(c.createdAt)}`}
        action={<StatusChip status={c.status} />}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="space-y-5">
          <Panel title={`Observasi aktif · ${d.observations.length}`}>
            <ul className="divide-y divide-line">
              {d.observations.map((o) => (
                <li key={o.id} className="px-4 py-3 text-[13px]">
                  <p className="font-semibold">
                    {o.sourceCode} · {o.domain}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {o.quality} · diterima {dateTime(o.receivedAt)}
                  </p>
                </li>
              ))}
            </ul>
            {!d.observations.length && (
              <p className="p-4 text-xs text-muted">
                Belum ada observasi aktif; service akan menolak mutasi.
              </p>
            )}
          </Panel>
          <Panel title="Audit review">
            <ol className="divide-y divide-line">
              {d.events.map((e) => (
                <li key={e.toVersion} className="px-4 py-3">
                  <p className="text-[13px] font-semibold">
                    {e.transitionId} · {e.fromStatus} → {e.toStatus}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {dateTime(e.createdAt)}
                  </p>
                  <p className="mt-1 text-[13px]">{e.reason}</p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
        <aside>
          <Panel title="Tindakan Operator">
            <div className="p-4">
              <CaseActionForm
                key={`${c.id}:${c.version}`}
                caseId={c.id}
                organizationId={a.organizationId}
                version={c.version}
                status={c.status}
                actorRole="operator"
              />
            </div>
          </Panel>
        </aside>
      </div>
    </OperatorLayout>
  );
}
