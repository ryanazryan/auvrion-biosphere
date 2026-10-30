import Link from "next/link";
import { OperationalCharts } from "@/components/supervisor/OperationalCharts";
import { getOperationalSummary } from "@/server/analytics/operational-summary";
import { findWorkspaceAccess } from "@/server/workflow/workspace-queries";

export const dynamic = "force-dynamic";

export default async function SupervisorAnalytics({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; mode?: string }>;
}) {
  const access = await findWorkspaceAccess("supervisor");
  if (!access.allowed)
    return <main className="p-6 text-sm">Akses analitik tidak tersedia.</main>;
  const params = await searchParams;
  const candidate = Number(params.year ?? new Date().getUTCFullYear());
  const year =
    Number.isSafeInteger(candidate) && candidate >= 2020 && candidate <= 2100
      ? candidate
      : new Date().getUTCFullYear();
  const preview = params.mode === "demo";
  const data = await getOperationalSummary(access.organizationId, year);
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            Analitik sinyal & verifikasi
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Indikasi lingkungan, sinyal bioakustik, dan review manusia
          </p>
        </div>
        <form method="GET" className="flex flex-wrap items-center gap-2">
          {preview && <input type="hidden" name="mode" value="demo" />}
          <label htmlFor="analytics-year" className="text-sm text-muted">
            Tahun
          </label>
          <input
            id="analytics-year"
            name="year"
            type="number"
            min="2020"
            max="2100"
            defaultValue={year}
            className="w-24 rounded-md border border-line bg-white px-2 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white"
          >
            Terapkan
          </button>
        </form>
      </header>
      <nav
        aria-label="Jenis data analitik"
        className="flex flex-wrap items-center gap-2"
      >
        <Link
          href={`/supervisor/analytics?year=${year}`}
          aria-current={!preview ? "page" : undefined}
          className={`rounded-md border px-3 py-2 text-sm ${!preview ? "border-brand bg-brand-50 text-brand" : "border-line bg-white text-muted"}`}
        >
          Data operasional
        </Link>
        <Link
          href={`/supervisor/analytics?year=${year}&mode=demo`}
          aria-current={preview ? "page" : undefined}
          className={`rounded-md border px-3 py-2 text-sm ${preview ? "border-amber-600 bg-amber-50 text-amber-900" : "border-line bg-white text-muted"}`}
        >
          Simulasi visual
        </Link>
      </nav>
      <OperationalCharts
        data={data}
        preview={preview}
        organizationId={access.organizationId}
      />
    </section>
  );
}
