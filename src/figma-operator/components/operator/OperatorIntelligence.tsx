"use client";

import { useEffect, useMemo, useState } from "react";
import { useOperator } from "@/figma-operator/operator-context";

type Datum = {
  date: string;
  biodiversity: number;
  environmental_risk: number;
  other: number;
  total: number;
};
type Intelligence = {
  source: "stored_observations";
  windowDays: number;
  generatedAt: string;
  dayTimeZone: "Asia/Jakarta" | "Asia/Makassar" | "Asia/Jayapura";
  totalInWindow: number;
  unreviewedAllTime: number;
  partial: boolean;
  trends: Datum[];
  domains: Record<string, number>;
  quality: Record<string, number>;
  sources: { code: string; count: number; lastReceivedAt: string }[];
  limitations: string[];
};
const dateLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

export function OperatorIntelligence() {
  const { operator, timeZone } = useOperator();
  const [data, setData] = useState<Intelligence | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<7 | 30>(7);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError(false);
    fetch(
      `/api/operator/overview/intelligence?organizationId=${encodeURIComponent(operator.organizationId)}&timeZone=${timeZone}`,
      {
        credentials: "same-origin",
        cache: "no-store",
        signal: abort.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) throw Error("UNAVAILABLE");
        return (await response.json()) as Intelligence;
      })
      .then((result) => {
        if (!abort.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setError(true);
          setLoading(false);
        }
      });
    return () => abort.abort();
  }, [operator.organizationId, timeZone]);

  const trend = useMemo(() => data?.trends.slice(-days) ?? [], [data, days]);
  const scale = Math.max(1, ...trend.map((datum) => datum.total));
  const domainTotal =
    (data?.domains.biodiversity ?? 0) + (data?.domains.environmental_risk ?? 0);
  const biodivPercent = domainTotal
    ? ((data?.domains.biodiversity ?? 0) / domainTotal) * 100
    : 0;
  return (
    <section
      aria-labelledby="wc024-intelligence-title"
      className="rounded-md border border-line bg-surface"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div>
          <h2
            id="wc024-intelligence-title"
            className="text-sm font-semibold text-ink"
          >
            Intelijen observasi
          </h2>
        </div>
        <fieldset
          aria-label="Rentang grafik"
          className="inline-flex min-w-0 rounded-md border border-line bg-bg p-0.5"
        >
          {([7, 30] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={days === value}
              onClick={() => setDays(value)}
              className={`rounded px-3 py-1 text-xs transition-colors ${days === value ? "bg-white font-semibold text-brand shadow-sm" : "text-muted hover:text-fg"}`}
            >
              {value} hari
            </button>
          ))}
        </fieldset>
      </header>
      {loading ? (
        <p className="p-5 text-sm text-muted">Memuat tren observasi…</p>
      ) : error || !data ? (
        <p className="p-5 text-sm text-muted">
          Statistik belum tersedia. Data tidak diganti dengan angka demo.
        </p>
      ) : (
        <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">
              Tren penerimaan observasi
            </p>
            <p className="mt-1 text-xs text-muted">
              Total {data.totalInWindow} observasi selama 30 hari · {timeZone}
            </p>
            <div
              className="mt-4 flex h-36 items-end gap-1 overflow-x-auto border-b border-line pb-1"
              role="img"
              aria-label={`Diagram batang observasi ${days} hari. ${trend.map((d) => `${d.date}: ${d.total}`).join(", ")}`}
            >
              {trend.map((datum) => (
                <div
                  key={datum.date}
                  className="flex h-full min-w-2 flex-1 flex-col justify-end gap-px"
                  title={`${datum.date}: ${datum.total} observasi`}
                >
                  <span
                    className="block w-full rounded-t-sm bg-brand/70"
                    style={{
                      height: `${Math.max(0, (datum.biodiversity / scale) * 100)}%`,
                    }}
                  />
                  <span
                    className="block w-full bg-warn/65"
                    style={{
                      height: `${Math.max(0, (datum.environmental_risk / scale) * 100)}%`,
                    }}
                  />
                  <span
                    className="block w-full bg-line-strong"
                    style={{
                      height: `${Math.max(0, (datum.other / scale) * 100)}%`,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted">
              <span>{trend[0] ? dateLabel(trend[0].date) : "–"}</span>
              <span>Data diterima · {timeZone}</span>
              <span>
                {trend.at(-1) ? dateLabel(trend.at(-1)?.date ?? "") : "–"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                <i className="mr-1.5 inline-block size-2.5 rounded-sm bg-brand/70" />
                Biodiversitas
              </span>
              <span>
                <i className="mr-1.5 inline-block size-2.5 rounded-sm bg-warn/65" />
                Risiko lingkungan
              </span>
            </div>
          </div>
          <div className="min-w-0 space-y-4">
            <div>
              <p className="text-[13px] font-semibold">
                Komposisi domain (30 hari)
              </p>
              <div
                className="mt-3 flex h-3 overflow-hidden rounded-full bg-line"
                role="img"
                aria-label={`Biodiversitas ${data.domains.biodiversity ?? 0}; risiko lingkungan ${data.domains.environmental_risk ?? 0}`}
              >
                <div
                  className="h-full bg-brand"
                  style={{ width: `${biodivPercent}%` }}
                />
                <div className="h-full flex-1 bg-warn/65" />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
                <span>
                  Biodiversitas:{" "}
                  <b className="text-fg">{data.domains.biodiversity ?? 0}</b>
                </span>
                <span>
                  Risiko:{" "}
                  <b className="text-fg">
                    {data.domains.environmental_risk ?? 0}
                  </b>
                </span>
              </div>
            </div>
            <div className="rounded-md border border-line bg-bg px-3 py-3">
              <p className="text-xs font-semibold">Perlu peninjauan</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {data.unreviewedAllTime}
              </p>
              <p className="text-xs text-muted">
                Observasi belum ditinjau, seluruh waktu
              </p>
            </div>
            <div>
              <p className="text-[13px] font-semibold">
                Aktivitas sumber tersimpan
              </p>
              {data.sources.length === 0 ? (
                <p className="mt-2 text-xs text-muted">
                  Belum ada data di jendela 30 hari.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-xs text-muted">
                  {data.sources.slice(0, 4).map((source) => (
                    <li
                      key={source.code}
                      className="flex justify-between gap-2"
                    >
                      <span className="min-w-0 truncate" title={source.code}>
                        {source.code}
                      </span>
                      <strong className="text-fg">
                        {source.count} rekaman
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-muted">
                Jumlah unggahan tidak membuktikan perangkat masih online.
              </p>
            </div>
          </div>
          {data.partial && (
            <p className="text-xs text-warn xl:col-span-2">
              Data sangat banyak; visualisasi ini hanya mewakili 5.000 rekaman
              terbaru dalam jendela 30 hari.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
