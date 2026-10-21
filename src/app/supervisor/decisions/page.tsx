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
  listWorkspaceCases,
} from "@/server/workflow/workspace-queries";

export const dynamic = "force-dynamic";
const filters = [
  { id: "awaiting", label: "Menunggu keputusan", match: "awaiting_decision" },
  { id: "monitoring", label: "Monitoring", match: "monitoring" },
  { id: "assigned", label: "Ditugaskan", match: "assigned" },
  { id: "all", label: "Semua", match: "" },
];
export default async function SupervisorDecisions({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const a = await findWorkspaceAccess("supervisor");
  if (!a.allowed) return null;
  const params = await searchParams;
  const view = filters.some((x) => x.id === params.view)
    ? params.view
    : "awaiting";
  const filter = filters.find((x) => x.id === view);
  const cases = await listWorkspaceCases(a.organizationId);
  const rows = filter?.match
    ? cases.filter((x) => x.status === filter.match)
    : cases;
  return (
    <>
      <PageHeading
        title="Antrean keputusan"
        desc="Tinjau Case yang dikirim Operator. Keputusan Monitoring atau penugasan Ranger hanya tersedia pada status Awaiting Decision."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.id}
            href={`/supervisor/decisions?view=${f.id}`}
            aria-current={view === f.id ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-[12px] font-semibold ${view === f.id ? "bg-brand text-white" : "border border-line bg-white text-muted hover:bg-bg"}`}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <Panel
        title={`Daftar Case · ${rows.length}`}
        aside={<span className="text-xs text-muted">100 terbaru maksimal</span>}
      >
        {!rows.length ? (
          <Empty text="Tidak ada Case pada filter ini." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/supervisor/decisions/${c.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-bg sm:flex-nowrap"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {c.title}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Case {shortId(c.id)} · versi {c.version} ·{" "}
                      {dateTime(c.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusChip status={c.status} />
                    <span className="text-xs font-semibold text-brand">
                      Detail →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
