"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AirQualityPayload,
  AirQualitySite,
} from "@/server/gis/air-quality-contract";

type Point = { latitude: number; longitude: number };
const EMPTY: AirQualitySite[] = [];

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
        if (!response.ok) throw new Error("UNAVAILABLE");
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
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [organizationId, enabled, visible]);

  // Tie the inspected model result to the active pin AND organization.
  // The scope is used by this effect, so Biome can validate its dependency.
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
    if (!selectedPoint || !enabled || pointState === "loading") return;
    const requestId = ++latestPinRequest.current;
    setPointState("loading");
    setPointSite(null);
    const qs = new URLSearchParams({
      organizationId,
      latitude: selectedPoint.latitude.toFixed(5),
      longitude: selectedPoint.longitude.toFixed(5),
    });
    try {
      const result = await fetch(`/api/gis/air-quality?${qs}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!result.ok) throw new Error("UNAVAILABLE");
      const value = (await result.json()) as AirQualityPayload;
      const site = value.sites[0];
      if (!site) throw new Error("NO_MODEL_DATA");
      if (requestId !== latestPinRequest.current) return;
      setPointSite(site);
      setPointState("idle");
    } catch {
      if (requestId === latestPinRequest.current) setPointState("error");
    }
  }

  return (
    <aside
      className="absolute bottom-[5.5rem] left-3 z-20 w-[min(280px,calc(100%-6rem))] max-md:bottom-[10rem] max-md:right-3 max-md:w-auto max-md:max-h-[min(45dvh,300px)] max-md:overflow-y-auto rounded-lg border border-line bg-white/95 p-3 shadow-md backdrop-blur-sm"
      aria-label="Indeks kualitas udara pada peta"
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
          Kualitas udara <span className="font-normal text-muted">US AQI</span>
        </label>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label="Detail kualitas udara"
          onClick={() => setExpanded((value) => !value)}
          className="rounded px-1.5 py-1 text-xs text-brand hover:bg-bg"
        >
          {expanded ? "Tutup" : "Detail"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted" role="status">
        {!enabled
          ? "Perlu basemap terkonfigurasi"
          : loading
            ? "Memuat model atmosfer…"
            : error
              ? "Data model tidak tersedia"
              : !visible
                ? "Lapisan nonaktif"
                : `${sites.filter((site) => site.usAqi !== null).length} lokasi · estimasi model`}
      </p>
      {expanded && (
        <div className="mt-2 space-y-2 border-t border-line pt-2 text-xs text-fg">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="text-[#2b8a57]">● 0–50</span>
            <span className="text-[#b88b14]">● 51–100</span>
            <span className="text-[#d66a27]">● 101–150</span>
            <span className="text-[#bc3636]">● 151+</span>
          </div>
          {selectedPoint ? (
            <div className="rounded-md border border-line p-2">
              <p className="font-medium">
                Pin {selectedPoint.latitude.toFixed(3)},{" "}
                {selectedPoint.longitude.toFixed(3)}
              </p>
              {pointSite ? (
                <p className="mt-1">
                  US AQI {pointSite.usAqi ?? "—"} · PM2.5{" "}
                  {pointSite.pm25 ?? "—"} · PM10 {pointSite.pm10 ?? "—"} µg/m³
                </p>
              ) : (
                <button
                  type="button"
                  disabled={pointState === "loading"}
                  onClick={() => void inspectPin()}
                  className="mt-2 rounded-md border border-line px-2 py-1 font-semibold text-brand hover:bg-bg disabled:opacity-50"
                >
                  {pointState === "loading"
                    ? "Mengambil estimasi…"
                    : "Muat AQI untuk pin"}
                </button>
              )}
              {pointState === "error" && (
                <p role="alert" className="mt-1 text-danger">
                  Estimasi titik belum tersedia.
                </p>
              )}
            </div>
          ) : (
            <p>Pilih titik pada peta untuk estimasi lokasi tertentu.</p>
          )}
          <p className="text-muted">
            Model CAMS global (~45 km). Bukan ISPU atau pengukuran sensor lokal;
            lokasi permintaan pin dibulatkan ~0,1°.
          </p>
          <a
            href="https://open-meteo.com/en/docs/air-quality-api"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-brand underline underline-offset-2"
          >
            Data Open-Meteo · CAMS
          </a>
        </div>
      )}
    </aside>
  );
}
