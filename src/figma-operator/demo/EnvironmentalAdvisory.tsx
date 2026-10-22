"use client";

import { useState } from "react";
import { openOperatorAssistant } from "./OperatorAssistant";

/** UI composition follows the Figma Make environmental advisory. No fabricated BMKG or FIRMS readings. */
export function EnvironmentalAdvisory({
  observationId,
  measurements,
}: {
  observationId: string;
  measurements: { label: string; value: string; unit?: string }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const facts = measurements.slice(0, 6).map((item) => ({
    label: item.label,
    value: `${item.value}${item.unit ? ` ${item.unit}` : ""}`,
  }));
  const onAsk = () =>
    openOperatorAssistant(
      "environment",
      observationId,
      facts,
      "Analisis data BMKG & NASA",
    );
  return (
    <section
      aria-labelledby="env-advisory-heading"
      className="overflow-hidden rounded-lg border border-line bg-white"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <h2
            id="env-advisory-heading"
            className="text-[15px] font-semibold text-ink"
          >
            Analisis lingkungan
          </h2>
        </div>
        <span className="rounded bg-bg px-2 py-0.5 text-xs text-muted">
          Belum terhubung
        </span>
      </header>
      <div className="px-4 py-3.5">
        <p className="text-[13px] text-muted">BMKG · NASA FIRMS</p>
        <p className="mt-2 text-[13px] leading-5">
          Konteks cuaca dan deteksi termal belum tersedia melalui API produksi.
        </p>
        {facts.length > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
            {facts.slice(0, 4).map((fact) => (
              <div key={fact.label} className="bg-white px-3 py-2">
                <dt className="text-xs text-muted">{fact.label}</dt>
                <dd className="mt-1 text-[13px] font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-3 text-xs leading-5 text-muted">
          Pengukuran di atas berasal dari observasi tersimpan. Tidak boleh
          dianggap sebagai prakiraan BMKG atau deteksi NASA.
        </p>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="rounded text-[13px] font-medium text-brand hover:underline"
          >
            Lihat sumber {expanded ? "⌃" : "⌄"}
          </button>
          <button
            type="button"
            onClick={onAsk}
            className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-brand transition-colors hover:bg-brand-50"
          >
            ✧ Tanya AI
          </button>
        </div>
        {expanded && (
          <div className="mt-3 rounded-md bg-bg px-3 py-3 text-[13px] leading-5">
            <p className="font-medium">BMKG</p>
            <p className="text-muted">
              Belum ada data API resmi yang terhubung.
            </p>
            <p className="mt-2 font-medium">NASA FIRMS</p>
            <p className="text-muted">
              Belum ada data deteksi termal resmi yang terhubung. Deteksi termal
              bukan konfirmasi kebakaran.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
