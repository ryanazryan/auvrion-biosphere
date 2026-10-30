"use client";

import { useMemo, useState } from "react";
import { SelectMenu } from "@/components/ui/SelectMenu";

const nowWita = new Date(Date.now() + 8 * 60 * 60 * 1000);
const PERIOD_OPTIONS = [
  { value: "month", label: "Per bulan" },
  { value: "year", label: "Per tahun" },
] as const;
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const month = index + 1;
  return {
    value: String(month),
    label: new Intl.DateTimeFormat("id-ID", {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2026, index, 1))),
  };
});

export function ObservationReportControls() {
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [year, setYear] = useState(nowWita.getUTCFullYear());
  const [month, setMonth] = useState(String(nowWita.getUTCMonth() + 1));
  const [includeUncased, setIncludeUncased] = useState(false);

  const yearIsValid =
    Number.isSafeInteger(year) && year >= 2020 && year <= 2100;
  const monthIsValid =
    Number.isSafeInteger(Number(month)) &&
    Number(month) >= 1 &&
    Number(month) <= 12;

  const urlParams = useMemo(() => {
    if (!yearIsValid || !monthIsValid) return null;
    return new URLSearchParams({
      period,
      year: String(year),
      month,
      includeUncased: includeUncased ? "yes" : "no",
    });
  }, [period, year, month, includeUncased, yearIsValid, monthIsValid]);

  function href(format: "xlsx" | "pdf") {
    if (!urlParams) return "#";
    const params = new URLSearchParams(urlParams);
    params.set("format", format);
    return `/api/operator/reports?${params.toString()}`;
  }

  const downloadStyle =
    "inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors";
  const disabledStyle = !urlParams ? "pointer-events-none opacity-50" : "";

  return (
    <section
      className="space-y-5 rounded-xl border border-line bg-white p-5"
      aria-labelledby="observation-report-title"
    >
      <div>
        <h2
          id="observation-report-title"
          className="text-lg font-semibold text-ink"
        >
          Ekspor riwayat observasi &amp; Case
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Laporan bulanan atau tahunan sesuai WITA. Data berasal dari database
          organisasi, bukan data contoh. Informasi rahasia dan koordinat presisi
          tidak diekspor.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="mb-1 text-xs font-medium text-muted">Periode</p>
          <SelectMenu
            label="Periode laporan"
            value={period}
            options={PERIOD_OPTIONS}
            onChange={setPeriod}
          />
        </div>
        <label
          className="block text-xs font-medium text-muted"
          htmlFor="report-year"
        >
          Tahun
          <input
            id="report-year"
            type="number"
            min={2020}
            max={2100}
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            aria-invalid={!yearIsValid}
            className="mt-1 block h-11 w-full rounded-md border border-line-strong bg-white px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-brand"
          />
        </label>
        <div>
          <p className="mb-1 text-xs font-medium text-muted">Bulan</p>
          <SelectMenu
            label="Bulan laporan"
            value={month}
            options={MONTH_OPTIONS}
            onChange={setMonth}
            disabled={period === "year"}
          />
        </div>
      </div>

      <label className="flex items-start gap-3 text-sm text-fg">
        <input
          type="checkbox"
          checked={includeUncased}
          onChange={(event) => setIncludeUncased(event.target.checked)}
          className="mt-1 accent-[#177e61]"
        />
        Sertakan observasi yang belum dibuat Case (default: hanya yang sudah
        dibuat Case)
      </label>

      {!yearIsValid && (
        <p role="alert" className="text-sm text-danger">
          Tahun harus berada antara 2020 dan 2100.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <a
          href={href("xlsx")}
          aria-disabled={!urlParams}
          className={`${downloadStyle} bg-brand text-white hover:bg-brand-hover ${disabledStyle}`}
        >
          Ekspor Excel (.xlsx)
        </a>
        <a
          href={href("pdf")}
          aria-disabled={!urlParams}
          className={`${downloadStyle} border border-line-strong bg-white text-brand hover:bg-bg ${disabledStyle}`}
        >
          Ekspor PDF
        </a>
      </div>
      <p className="text-xs text-muted">
        Berisi ID observasi, waktu diterima dan diamati, sumber, domain, mode,
        kualitas, Case terkait, dan status penanganan. Maksimum 5.000 baris per
        permintaan.
      </p>
    </section>
  );
}
