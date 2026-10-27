"use client";

import { useEffect, useState } from "react";
import { formatEvidenceTime } from "@/figma-operator/gis/observation-evidence-display";
import { useOperator } from "@/figma-operator/operator-context";
import { openOperatorAssistant } from "./OperatorAssistant";

type ExternalContext = {
  region: string;
  retrievedAtUtc: string;
  bmkg:
    | {
        state: "available";
        data: {
          location: string | null;
          intervals: Array<{
            utc: string;
            tempC: number | null;
            humidityPct: number | null;
            description: string | null;
          }>;
        };
      }
    | { state: "unavailable"; reason: string };
  pointForecast?:
    | {
        state: "available";
        provider: "Open-Meteo";
        retrievedAtUtc: string;
        validAtUtc: string;
        temperatureC: number | null;
        humidityPct: number | null;
        precipitationMm: number | null;
        windKmh: number | null;
        precision: "rounded_0_1_degree";
      }
    | { state: "unavailable"; reason: string };
  nasa:
    | {
        state: "available";
        data: {
          count: number;
          latestUtc: string | null;
          windowDays: number;
          sensor: string;
        };
      }
    | { state: "unavailable"; reason: string };
  sources: { bmkg: string; nasa: string };
};

/** WC024 real external context, explicitly distinct from local observation measurements. */
export function EnvironmentalAdvisory({
  observationId,
  measurements,
  sourceSummary,
}: {
  observationId: string;
  measurements: { label: string; value: string; unit?: string }[];
  sourceSummary: string;
}) {
  const { operator, timeZone } = useOperator();
  const [expanded, setExpanded] = useState(false);
  const [external, setExternal] = useState<ExternalContext | null>(null);
  const [status, setStatus] = useState<"loading" | "available" | "unavailable">(
    "loading",
  );
  useEffect(() => {
    const controller = new AbortController();
    setExternal(null);
    setStatus("loading");
    void (async () => {
      try {
        const response = await fetch(
          `/api/operator/environment/context?organizationId=${encodeURIComponent(operator.organizationId)}&observationId=${encodeURIComponent(observationId)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!response.ok) throw new Error("UNAVAILABLE");
        const data: unknown = await response.json();
        if (
          !data ||
          typeof data !== "object" ||
          !("bmkg" in data) ||
          !("nasa" in data)
        )
          throw new Error("INVALID_RESPONSE");
        if (!controller.signal.aborted) {
          setExternal(data as ExternalContext);
          setStatus("available");
        }
      } catch {
        if (!controller.signal.aborted) setStatus("unavailable");
      }
    })();
    return () => controller.abort();
  }, [operator.organizationId, observationId]);
  const facts = measurements.slice(0, 6).map((item) => ({
    label: item.label,
    value: `${item.value}${item.unit ? ` ${item.unit}` : ""}`,
  }));
  const bmkgOk = external?.bmkg.state === "available";
  const nasaOk = external?.nasa.state === "available";
  const pointOk = external?.pointForecast?.state === "available";
  const pointData =
    external?.pointForecast?.state === "available"
      ? external.pointForecast
      : null;
  const bmkgData =
    external?.bmkg.state === "available" ? external.bmkg.data : null;

  const nasaData =
    external?.nasa.state === "available" ? external.nasa.data : null;

  const forecast = bmkgData?.intervals[0] ?? null;
  return (
    <section
      aria-labelledby="env-advisory-heading"
      className="overflow-hidden rounded-lg border border-line bg-white"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2
          id="env-advisory-heading"
          className="text-[15px] font-semibold text-ink"
        >
          Analisis lingkungan
        </h2>
        <span className="rounded bg-bg px-2 py-0.5 text-xs text-muted">
          {status === "loading"
            ? "Memuat data resmi"
            : bmkgOk || nasaOk || pointOk
              ? "Data referensi tersedia"
              : "Data belum tersedia"}
        </span>
      </header>
      <div className="px-4 py-3.5 text-[13px] leading-5">
        <p className="text-muted">
          Prakiraan cuaca · NASA FIRMS · Referensi lingkungan, bukan kondisi
          sensor IoT maupun bukti kebakaran.
        </p>
        {external && (
          <p className="mt-1 text-xs text-muted">
            Wilayah referensi: {external.region} · Diperiksa:{" "}
            {formatEvidenceTime(external.retrievedAtUtc, timeZone)}
          </p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-bg p-3">
            <p className="font-semibold">Prakiraan BMKG</p>
            {bmkgOk && forecast ? (
              <p className="mt-1">
                {forecast.description ?? "Kondisi tidak dicantumkan"} ·{" "}
                {forecast.tempC === null
                  ? "Suhu tidak tersedia"
                  : `${forecast.tempC} °C`}{" "}
                ·{" "}
                {forecast.humidityPct === null
                  ? "Kelembapan tidak tersedia"
                  : `${forecast.humidityPct}%`}
                .
                <span className="block text-xs text-muted">
                  Berlaku: {formatEvidenceTime(forecast.utc, timeZone)}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-muted">
                ADM4 titik ini belum dipetakan ke wilayah BMKG yang
                terverifikasi, atau layanan sedang tidak tersedia.
              </p>
            )}
          </div>
          <div className="rounded-md border border-line bg-bg p-3">
            <p className="font-semibold">NASA FIRMS</p>
            {nasaData ? (
              <p className="mt-1">
                {nasaData.count} titik anomali termal dalam{" "}
                {nasaData.windowDays} hari.
                <span className="block text-xs text-muted">
                  Sensor: {nasaData.sensor.replaceAll("_", " · ")} · NASA FIRMS
                  (VIIRS NRT).
                </span>
                <span className="block text-xs text-muted">
                  {nasaData.latestUtc
                    ? `Deteksi terakhir: ${formatEvidenceTime(nasaData.latestUtc, timeZone)}`
                    : "Tidak ada deteksi tercatat pada cakupan dan periode ini."}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-muted">
                Data satelit belum tersedia atau MAP_KEY belum disetel.
              </p>
            )}
          </div>
        </div>
        {pointData && (
          <div className="mt-3 rounded-md border border-line bg-bg p-3">
            <p className="font-semibold">Prakiraan titik — Open-Meteo</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              <span>
                Suhu:{" "}
                {pointData.temperatureC === null
                  ? "—"
                  : `${pointData.temperatureC} °C`}
              </span>
              <span>
                Kelembapan:{" "}
                {pointData.humidityPct === null
                  ? "—"
                  : `${pointData.humidityPct}%`}
              </span>
              <span>
                Hujan per jam:{" "}
                {pointData.precipitationMm === null
                  ? "—"
                  : `${pointData.precipitationMm} mm`}
              </span>
              <span>
                Angin:{" "}
                {pointData.windKmh === null
                  ? "—"
                  : `${pointData.windKmh} km/jam`}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">
              Berlaku: {formatEvidenceTime(pointData.validAtUtc, timeZone)} ·
              Model cuaca untuk koordinat yang dibulatkan 0,1°, bukan prakiraan
              resmi BMKG dan bukan kondisi persis di titik sensor.
            </p>
          </div>
        )}
        {external?.bmkg.state !== "available" &&
          !pointData &&
          status === "available" && (
            <p className="mt-3 text-xs text-muted">
              Prakiraan titik juga belum tersedia dari penyedia. Tidak
              menggunakan nilai pengganti.
            </p>
          )}
        {facts.length > 0 && (
          <div className="mt-3 rounded-md border border-line p-3">
            <p className="mb-2 font-medium">
              Pengukuran observasi tersimpan (bukan nilai BMKG/NASA)
            </p>
            <p className="mb-2 text-xs text-muted">
              Sumber data observasi: {sourceSummary}. Perangkat IoT hanya
              ditampilkan jika data perangkat benar-benar telah masuk melalui
              ingestion.
            </p>
            <dl className="grid grid-cols-2 gap-2">
              {facts.slice(0, 4).map((fact) => (
                <div key={fact.label}>
                  <dt className="text-xs text-muted">{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="rounded text-[13px] font-medium text-brand hover:underline"
          >
            Sumber {expanded ? "⌃" : "⌄"}
          </button>
          <button
            type="button"
            onClick={() =>
              openOperatorAssistant(
                "environment",
                observationId,
                facts,
                "Analisis konteks BMKG dan NASA FIRMS untuk wilayah referensi ini.",
              )
            }
            className="rounded-md px-2.5 py-1.5 font-medium text-brand hover:bg-brand-50"
          >
            ✧ Tanya AI
          </button>
        </div>
        {expanded && (
          <div className="mt-3 space-y-2 rounded-md bg-bg p-3 text-xs">
            <p>
              <a
                href="https://data.bmkg.go.id/prakiraan-cuaca/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-brand underline"
              >
                BMKG — Prakiraan cuaca
              </a>{" "}
              · {bmkgOk ? "Tersedia" : "Belum tersedia"}
            </p>
            <p>
              <a
                href="https://firms.modaps.eosdis.nasa.gov/api/area"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-brand underline"
              >
                NASA FIRMS — VIIRS NRT
              </a>{" "}
              · {nasaOk ? "Tersedia" : "Belum tersedia"}
            </p>
            <p>
              <a
                href="https://open-meteo.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-brand underline"
              >
                Open-Meteo — model cuaca berbasis lokasi
              </a>{" "}
              · {pointOk ? "Tersedia" : "Belum tersedia"}
            </p>
            <p className="text-muted">
              Waktu pengambilan referensi berbeda dari waktu observasi maupun
              waktu akuisisi satelit. Ketersediaan satu sumber tidak mewakili
              sumber lain.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
