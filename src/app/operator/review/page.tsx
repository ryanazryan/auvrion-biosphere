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
export default async function OperatorReviewQueue() {
  const access = await findWorkspaceAccess("operator");
  if (!access.allowed) return null;
  const cases = await listWorkspaceCases(access.organizationId);
  const active = cases.filter(
    (c) => c.status === "received" || c.status === "under_review",
  );
  return (
    <OperatorLayout
      path="/operator/review"
      crumbs={[{ label: "Antrean Review" }]}
    >
      <PageHeading
        title="Antrean Review"
        desc="Review Case yang sudah dibuat dan terhubung dengan observasi sah. Kasus baru tidak dibuat otomatis dari setiap observasi."
      />
      <div className="mb-5">
        <Link
          href="/operator/review/new"
          className="inline-flex min-h-10 items-center rounded-md bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-hover"
        >
          + Buat Case dari observasi manual
        </Link>
      </div>
      <Panel title={`Menunggu review · ${active.length}`}>
        {!active.length ? (
          <Empty text="Belum ada Case Received atau Under Review. Intake dan pembuatan Case masih memerlukan alur terpisah." />
        ) : (
          <ul className="divide-y divide-line">
            {active.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/operator/review/${c.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-bg"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {c.title}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {shortId(c.id)} · v{c.version} · {dateTime(c.createdAt)}
                    </p>
                  </div>
                  <StatusChip status={c.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </OperatorLayout>
  );
}
