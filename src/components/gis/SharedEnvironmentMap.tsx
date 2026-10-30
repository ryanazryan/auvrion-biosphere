"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SelectMenu } from "@/components/ui/SelectMenu";
import type { GisRecord } from "@/figma-operator/gis/client";
import type {
  HotspotPoint,
  HotspotsPayload,
} from "@/figma-operator/gis/hotspots";
import { GisMapCanvas } from "@/figma-operator/screens/operator/GisMapCanvas";
import type { AirQualitySite } from "@/server/gis/air-quality-contract";
import { AirQualityControl } from "./AirQualityControl";
import { IslandSelector } from "./IslandSelector";
import {
  ISLAND_REGIONS,
  type IslandRegion,
  islandBounds,
  islandHotspots,
} from "./island-regions";
import { MapLocationControls } from "./MapLocationControls";
import type { MapNavigationTarget } from "./map-navigation";

const EMPTY_GIS_ROWS: GisRecord[] = [];

const basemapConfigured = Boolean(
  process.env.NEXT_PUBLIC_AUVRION_BASEMAP_STYLE_URL?.trim() &&
    process.env.NEXT_PUBLIC_AUVRION_BASEMAP_ATTRIBUTION?.trim(),
);

export function SharedEnvironmentMap({
  organizationId,
  workspaceRole,
}: {
  organizationId: string;
  workspaceRole: "supervisor" | "ranger";
}) {
  const [island, setIsland] = useState<IslandRegion>("kalimantan");
  const [days, setDays] = useState<HotspotsPayload["days"]>(2);
  const [hotspotRetry, setHotspotRetry] = useState(0);
  const [navigationTarget, setNavigationTarget] =
    useState<MapNavigationTarget | null>(null);
  const [hotspotEnabled, setHotspotEnabled] = useState(true);

  const [allHotspots, setAllHotspots] = useState<HotspotPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const requestSeq = useRef(0);

  const [airQuality, setAirQuality] = useState<AirQualitySite[]>([]);
  const [pin, setPin] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    void hotspotRetry; // Intentionally force refetch when Retry is clicked.
    const seq = ++requestSeq.current;
    const controller = new AbortController();

    if (!basemapConfigured || !hotspotEnabled) {
      setAllHotspots([]);
      setLoading(false);
      setError(null);
      setTruncated(false);

      return () => controller.abort();
    }

    setLoading(true);
    setError(null);
    setAllHotspots([]);

    const qs = new URLSearchParams({
      organizationId,
      regionId: island,
      days: String(days),
    });

    void (async () => {
      try {
        const response = await fetch(`/api/gis/hotspots?${qs}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`NASA_HOTSPOTS_HTTP_${response.status}`);
        }

        const result = (await response.json()) as HotspotsPayload;

        if (controller.signal.aborted || seq !== requestSeq.current) {
          return;
        }

        if (
          result.regionId !== island ||
          result.days !== days ||
          !Array.isArray(result.features)
        ) {
          throw new Error("INVALID_PAYLOAD");
        }

        setTruncated(result.truncated);
        setAllHotspots(result.features);
      } catch (cause) {
        if (controller.signal.aborted || seq !== requestSeq.current) {
          return;
        }

        setAllHotspots([]);
        setTruncated(false);
        setError(
          cause instanceof Error ? cause.message : "NETWORK_UNAVAILABLE",
        );
      } finally {
        if (!controller.signal.aborted && seq === requestSeq.current) {
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [organizationId, hotspotEnabled, island, days, hotspotRetry]);

  const focusBounds = useMemo(() => islandBounds(island), [island]);

  const visibleHotspots = useMemo(
    () => (hotspotEnabled ? islandHotspots(allHotspots, island) : []),
    [allHotspots, island, hotspotEnabled],
  );

  const islandLabel = ISLAND_REGIONS[island].label;

  const visibleCount = visibleHotspots.length.toLocaleString("id-ID");

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1500px] space-y-4 px-3 py-4 text-fg sm:px-5 lg:px-6">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Peta Lingkungan
          </h1>

          <p className="mt-1 text-xs text-muted">
            {workspaceRole === "supervisor"
              ? "Pemantauan lingkungan dan aktivitas lapangan"
              : "Kondisi lingkungan di wilayah operasi"}
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <IslandSelector
            value={island}
            onChange={setIsland}
            className="w-44 max-w-[calc(100vw-2rem)]"
          />

          <div className="min-w-[130px]">
            <SelectMenu
              label="Periode hotspot satelit"
              value={String(days)}
              options={[
                { value: "1", label: "1 hari" },
                { value: "2", label: "2 hari" },
                { value: "5", label: "5 hari" },
              ]}
              onChange={(value) => {
                const next = Number(value);
                if (next === 1 || next === 2 || next === 5) setDays(next);
              }}
            />
          </div>

          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 text-xs font-medium">
            <input
              type="checkbox"
              checked={hotspotEnabled}
              disabled={!basemapConfigured}
              onChange={(event) => setHotspotEnabled(event.target.checked)}
              className="accent-[#20785f]"
            />

            <span>Hotspot satelit</span>

            <span className="font-semibold text-brand">
              {hotspotEnabled ? "Aktif" : "Nonaktif"}
            </span>
          </label>
        </div>
      </header>

      <div className="relative h-[min(70vh,740px)] min-h-[430px] overflow-hidden rounded-xl border border-line bg-bg max-md:h-[calc(100dvh-11rem)] max-md:min-h-[500px]">
        <GisMapCanvas
          rows={EMPTY_GIS_ROWS}
          selected={null}
          onSelect={() => undefined}
          hotspots={visibleHotspots}
          hotspotBounds={focusBounds}
          airQualitySites={airQuality}
          onPickedLocationChange={setPin}
          navigationTarget={navigationTarget}
        />
        {/* AB-WC-011-PIN-AQI-UX-20261028 */}
        <MapLocationControls
          organizationId={organizationId}
          onNavigate={(target) => {
            setNavigationTarget(target);
            setPin(
              target
                ? { latitude: target.latitude, longitude: target.longitude }
                : null,
            );
          }}
        />

        {/* Ringkasan hotspot berada di dalam peta. */}
        {hotspotEnabled && (
          <div
            role="status"
            data-testid="hotspot-visible-count"
            className="pointer-events-none absolute top-3 left-3 z-20 w-fit max-w-[min(290px,calc(100%-6rem))] rounded-lg border border-line bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur-sm sm:top-4 sm:left-4"
          >
            {loading ? (
              <p className="text-xs font-medium text-ink">
                Memuat hotspot satelit…
              </p>
            ) : error ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-danger">
                  Data satelit tidak tersedia
                </p>
                <p className="text-[11px] text-muted">
                  {error === "NASA_HOTSPOTS_HTTP_503"
                    ? "Layanan FIRMS tidak dapat dimuat. Coba periode lebih singkat atau pulau yang lebih kecil."
                    : `Permintaan gagal (${error}). Coba lagi.`}
                </p>
                <button
                  type="button"
                  className="pointer-events-auto text-[11px] font-semibold text-brand underline"
                  onClick={() => setHotspotRetry((value) => value + 1)}
                >
                  Coba lagi
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-[13px] font-semibold tabular-nums text-ink">
                  {visibleCount} anomali termal
                </p>

                <p className="text-[11px] text-muted">
                  {islandLabel} · NASA FIRMS · {days} hari
                </p>

                {truncated && (
                  <p className="text-[11px] text-warn">
                    Hasil dibatasi oleh server.
                  </p>
                )}

                {visibleHotspots.length === 0 && (
                  <p className="text-[11px] text-muted">
                    Tidak ada deteksi dalam cakupan terpilih.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <AirQualityControl
          organizationId={organizationId}
          enabled={basemapConfigured}
          selectedPoint={pin}
          onSites={setAirQuality}
        />
      </div>
    </main>
  );
}
