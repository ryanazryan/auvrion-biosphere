import Link from "next/link";
import { OperatorLayout } from "@/figma-operator/components/operator/OperatorLayout";

export default function PreventPage() {
  return (
    <OperatorLayout
      path="/operator/iot"
      crumbs={[
        { label: "Alat IoT", href: "/operator/iot" },
        { label: "PREVENT" },
      ]}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">PREVENT</h1>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          Belum diimplementasikan
        </span>
      </div>
      <section className="mt-6 grid min-h-80 place-items-center rounded-2xl border border-dashed border-emerald-700/25 bg-gradient-to-br from-emerald-50 to-white p-8 text-center">
        <div>
          <div
            aria-hidden="true"
            className="mx-auto mb-5 grid size-20 place-items-center rounded-2xl bg-emerald-900 text-3xl font-bold text-white shadow-[10px_10px_0_#add7c6]"
          >
            P
          </div>
          <h2 className="text-lg font-bold text-ink">
            Belum ada perangkat PREVENT terhubung
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Integrasi sensor PREVENT belum selesai. Tidak ada pembacaan sensor
            tiruan yang ditampilkan.
          </p>
          <Link
            href="/operator/iot"
            className="mt-6 inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Kembali ke Alat IoT
          </Link>
        </div>
      </section>
    </OperatorLayout>
  );
}
