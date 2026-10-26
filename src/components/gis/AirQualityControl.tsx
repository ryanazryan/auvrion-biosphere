"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AirQualityPayload,
  AirQualitySite,
} from "@/server/gis/air-quality-contract";

type Point = {
  latitude: number;
  longitude: number;
};

const EMPTY: AirQualitySite[] = [];

const AQI_LEVELS = [
  { range: "0–50", label: "Baik", color: "#2b8a57" },
  { range: "51–100", label: "Sedang", color: "#c49c19" },
  { range: "101–150", label: "Sensitif", color: "#ed8435" },
  { range: "151–200", label: "Tidak sehat", color: "#d34a4a" },
  { range: "201–300", label: "Sangat tidak sehat", color: "#8f3f97" },
  { range: "301+", label: "Berbahaya", color: "#7e0023" },
] as const;

export function AirQualityControl({
  organizationId,
  enabled,
  selectedPoint,
  onSites,
}: {
  organizationId: string;
  enabled: boolean;
  selectedPoint: Point | null;
  onSites: (sites: AirQualitySite[]) => void;
}) {
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [sites, setSites] = useState<AirQualitySite[]>(EMPTY);
  const [pointSite, setPointSite] = useState<AirQualitySite | null>(null);
  const [pointState, setPointState] = useState<"idle" | "loading" | "error">(
    "idle",
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const latestPinRequest = useRef(0);

  useEffect(() => {
    if (!visible || !enabled) {
      setSites(EMPTY);
      return;
    }

    const abort = new AbortController();

    setLoading(true);
    setError(false);

    const qs = new URLSearchParams({ organizationId });

    fetch(`/api/gis/air-quality?${qs}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: abort.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("UNAVAILABLE");
        }

        return response.json() as Promise<AirQualityPayload>;
      })
      .then((value) => {
        if (abort.signal.aborted) return;

        setSites(Array.isArray(value.sites) ? value.sites : EMPTY);
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setError(true);
          setSites(EMPTY);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      });

    return () => abort.abort();
  }, [organizationId, enabled, visible]);

  const pinScope = `${organizationId}:${selectedPoint?.latitude ?? "none"}:${selectedPoint?.longitude ?? "none"}`;
  const previousPinScope = useRef(pinScope);

  useEffect(() => {
    if (previousPinScope.current === pinScope) return;

    previousPinScope.current = pinScope;
    latestPinRequest.current += 1;

    setPointSite(null);
    setPointState("idle");
  }, [pinScope]);

  useEffect(() => {
    onSites(
      enabled && visible ? (pointSite ? [...sites, pointSite] : sites) : EMPTY,
    );
  }, [enabled, visible, sites, pointSite, onSites]);

  async function inspectPin() {
    if (!selectedPoint || !enabled || pointState === "loading") {
      return;
    }

    const requestId = ++latestPinRequest.current;

    setPointState("loading");
    setPointSite(null);

    const qs = new URLSearchParams({
      organizationId,
      latitude: selectedPoint.latitude.toFixed(5),
      longitude: selectedPoint.longitude.toFixed(5),
    });

    try {
      const response = await fetch(`/api/gis/air-quality?${qs}`, {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("UNAVAILABLE");
      }

      const value = (await response.json()) as AirQualityPayload;

      const site = value.sites[0];

      if (!site) {
        throw new Error("NO_MODEL_DATA");
      }

      if (requestId !== latestPinRequest.current) return;

      setPointSite(site);
      setPointState("idle");
    } catch {
      if (requestId === latestPinRequest.current) {
        setPointState("error");
      }
    }
  }

  const locationCount = sites.filter((site) => site.usAqi !== null).length;

  return (
    <aside
      aria-label="Indeks kualitas udara pada peta"
      className="absolute bottom-[5.5rem] left-3 z-20 w-[min(310px,calc(100%-6rem))] rounded-lg border border-line bg-white/95 p-3 shadow-md backdrop-blur-sm max-md:bottom-[10rem] max-md:right-3 max-md:max-h-[min(50dvh,360px)] max-md:w-auto max-md:overflow-y-auto"
    >
      <div className="flex items-center justify-between gap-2">
        <label className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-ink">
          <input
            type="checkbox"
            checked={visible && enabled}
            disabled={!enabled}
            onChange={(event) => setVisible(event.target.checked)}
            className="accent-[#20785f]"
          />

          <span>Kualitas udara</span>

          <span className="font-normal text-muted">US AQI</span>
        </label>

        <button
          type="button"
          aria-expanded={expanded}
          aria-label="Detail kualitas udara"
          onClick={() => setExpanded((value) => !value)}
          className="rounded px-1.5 py-1 text-xs font-medium text-brand hover:bg-bg"
        >
          {expanded ? "Tutup" : "Detail"}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-muted" role="status">
        {!enabled
          ? "Peta dasar belum tersedia"
          : loading
            ? "Memuat kualitas udara…"
            : error
              ? "Data kualitas udara tidak tersedia"
              : !visible
                ? "Lapisan nonaktif"
                : `${locationCount} lokasi · Data estimasi`}
      </p>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-line pt-3 text-xs text-fg">
          <div>
            <p className="mb-2 text-[11px] font-medium text-muted">
              Skala kualitas udara
            </p>

            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {AQI_LEVELS.map((level) => (
                <div
                  key={level.range}
                  className="flex min-w-0 items-start gap-2"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: level.color,
                    }}
                  />

                  <div className="min-w-0">
                    <p className="font-medium tabular-nums">{level.range}</p>
                    <p className="text-[10px] leading-4 text-muted">
                      {level.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedPoint ? (
            <div className="rounded-md border border-line p-2.5">
              <p className="font-semibold">Lokasi dipilih</p>

              <p className="mt-1 font-mono text-[11px] text-muted">
                {selectedPoint.latitude.toFixed(3)},{" "}
                {selectedPoint.longitude.toFixed(3)}
              </p>

              {pointSite ? (
                <div className="mt-2 space-y-1">
                  <p className="font-medium">
                    US AQI: {pointSite.usAqi ?? "—"}
                  </p>

                  <p className="text-muted">
                    PM2.5: {pointSite.pm25 ?? "—"} µg/m³
                  </p>

                  <p className="text-muted">
                    PM10: {pointSite.pm10 ?? "—"} µg/m³
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={pointState === "loading"}
                  onClick={() => void inspectPin()}
                  className="mt-2 rounded-md border border-line px-3 py-1.5 font-medium text-brand hover:bg-bg disabled:opacity-50"
                >
                  {pointState === "loading"
                    ? "Memuat data…"
                    : "Lihat kualitas udara"}
                </button>
              )}

              {pointState === "error" && (
                <p role="alert" className="mt-2 text-danger">
                  Data lokasi belum tersedia.
                </p>
              )}
            </div>
          ) : (
            <p className="leading-5 text-muted">
              Pilih titik pada peta untuk melihat kualitas udara.
            </p>
          )}

          <div className="border-t border-line pt-2.5">
            <p className="text-[11px] text-muted">
              Sumber: CAMS · Resolusi sekitar 45 km
            </p>

            <a
              href="https://open-meteo.com/en/docs/air-quality-api"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block text-[11px] font-medium text-brand underline underline-offset-2"
            >
              Open-Meteo
            </a>
          </div>
        </div>
      )}
    </aside>
  );
}
