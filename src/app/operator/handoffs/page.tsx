import Link from "next/link";
import {
  dateTime,
  Empty,
  PageHeading,
  Panel,
  StatusChip,
  shortId,
} from "@/components/supervisor/SupervisorElements";
import { OperatorLayout } from "@/figma-operator/components/operator/OperatorLayout";
import {
  findWorkspaceAccess,
  listWorkspaceCases,
} from "@/server/workflow/workspace-queries";

export const dynamic = "force-dynamic";
export default async function OperatorHandoffs() {
  const a = await findWorkspaceAccess("operator");
  if (!a.allowed) return null;
  const cases = (await listWorkspaceCases(a.organizationId)).filter((c) =>
    ["awaiting_decision", "monitoring", "assigned"].includes(c.status),
  );
  return (
    <OperatorLayout
      path="/operator/handoffs"
      crumbs={[{ label: "Pelacakan Handoff" }]}
    >
      <PageHeading
        title="Pelacakan Handoff"
        desc="Status Case setelah direview Operator dan dikirim ke Supervisor. Halaman ini tidak memberi Operator hak untuk mengambil keputusan Supervisor."
      />
      <Panel title={`Riwayat handoff · ${cases.length}`}>
        {!cases.length ? (
          <Empty text="Belum ada Case yang dikirim ke Supervisor." />
        ) : (
          <ul className="divide-y divide-line">
            {cases.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-4 py-4"
              >
                <div className="min-w-0">
                  <Link
                    className="block truncate text-[13px] font-semibold text-ink hover:text-brand"
                    href={`/operator/review/${c.id}`}
                  >
                    {c.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted">
                    {shortId(c.id)} · v{c.version} · {dateTime(c.createdAt)}
                  </p>
                </div>
                <StatusChip status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </OperatorLayout>
  );
}
