"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GisRecord } from "@/figma-operator/gis/client";
import { approvedPoint } from "@/figma-operator/gis/client";

const STYLE_URL = process.env.NEXT_PUBLIC_AUVRION_BASEMAP_STYLE_URL?.trim();
const ATTRIBUTION = process.env.NEXT_PUBLIC_AUVRION_BASEMAP_ATTRIBUTION?.trim();
const HAS_APPROVED_BASEMAP = Boolean(STYLE_URL && ATTRIBUTION);

/** The Figma schematic is only a LOCAL backdrop. It NEVER hosts real/synthetic observation markers. */
const LOCAL_SCHEMATIC_PREVIEW =
  process.env.NODE_ENV === "development" && !HAS_APPROVED_BASEMAP;

/** No third-party basemap request without both an approved URL and its attribution. */
export function GisMapCanvas({
  rows,
  selected,
  onSelect,
  focusTarget = null,
}: {
  rows: GisRecord[];
  selected: string | null;
  onSelect: (id: string) => void;
  /** Explicit, approved pan action; never inferred from normal list selection. */
  focusTarget?: { id: string; request: number } | null;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const markerButtons = useRef(new Map<string, HTMLButtonElement>());
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [legendOpen, setLegendOpen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [bearing, setBearing] = useState(0);

  useEffect(() => {
    for (const [id, button] of markerButtons.current) {
      button.style.outline = id === selected ? "3px solid #142d25" : "";
    }
  }, [selected]);

  const points = useMemo(
    () =>
      rows.flatMap((row) => {
        const at = approvedPoint(row);
        return at ? [{ id: row.id, domain: row.domain, at }] : [];
      }),
    [rows],
  );

  useEffect(() => {
    // Explicit retry trigger: keep this dependency to reinitialize MapLibre.
    void retryKey;
    setMapLoaded(false);
    setBearing(0);
    if (
      (!HAS_APPROVED_BASEMAP && !LOCAL_SCHEMATIC_PREVIEW) ||
      !containerRef.current
    ) {
      return;
    }
    let disposed = false;
    let map: import("maplibre-gl").Map | undefined;
    const markers: import("maplibre-gl").Marker[] = [];
    const buttons = markerButtons.current;

    (async () => {
      try {
        const lib = await import("maplibre-gl");
        lib.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
        const schematic = LOCAL_SCHEMATIC_PREVIEW
          ? (
              await import("@/figma-operator/gis/schematic-style")
            ).syntheticBasemap()
          : null;
        if (disposed || !containerRef.current) return;
        const validatedStyle = schematic?.style ?? STYLE_URL;
        if (!validatedStyle) throw new Error("BASEMAP_STYLE_UNAVAILABLE");

        map = new lib.Map({
          container: containerRef.current,
          style: validatedStyle,
          ...(schematic
            ? {
                bounds: schematic.frame,
                fitBoundsOptions: { padding: 40, maxZoom: 14 },
              }
            : { center: [117, -2.5] as [number, number], zoom: 3.5 }),
          attributionControl: false,
          maxPitch: 0,
        });
        mapRef.current = map;
        map.on("rotate", () => {
          if (!disposed && map) setBearing(map.getBearing());
        });

        map.once("load", () => {
          if (disposed || !map) return;
          const activeMap = map;
          setMapLoaded(true);
          setBearing(activeMap.getBearing());
          // Do not place actual observations on invented local cartography.
          for (const point of schematic ? [] : points) {
            const button = document.createElement("button");
            button.type = "button";
            button.title = `Observasi ${point.id}`;
            button.setAttribute("aria-label", `Pilih observasi ${point.id}`);
            button.className = "gis-marker";
            button.style.setProperty(
              "--marker",
              point.domain === "biodiversity" ? "#20785f" : "#3d5870",
            );
            buttons.set(point.id, button);
            button.addEventListener("click", (event) => {
              event.stopPropagation();
              onSelectRef.current(point.id);
            });
            markers.push(
              new lib.Marker({ element: button })
                .setLngLat(point.at)
                .addTo(activeMap),
            );
          }
          if (!schematic && points.length > 0) {
            const bounds = new lib.LngLatBounds();
            for (const point of points) bounds.extend(point.at);
            activeMap.fitBounds(bounds, {
              padding: 70,
              maxZoom: 13,
              duration: 0,
            });
          }
        });
        map.on("error", () => {
          if (!disposed) {
            setMapLoaded(false);
            setError(true);
          }
        });
      } catch {
        if (!disposed) {
          setMapLoaded(false);
          setError(true);
        }
      }
    })();

    return () => {
      disposed = true;
      for (const marker of markers) marker.remove();
      buttons.clear();
      mapRef.current = null;
      map?.remove();
    };
  }, [points, retryKey]);

  // Resize the WebGL viewport whenever mobile list/panel geometry changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!HAS_APPROVED_BASEMAP || !focusTarget) return;
    const point = points.find((item) => item.id === focusTarget.id);
    if (point && mapRef.current) {
      mapRef.current.flyTo({ center: point.at, zoom: 13, duration: 500 });
    }
  }, [focusTarget, points]);

  const ready = HAS_APPROVED_BASEMAP || LOCAL_SCHEMATIC_PREVIEW;
  const controlsEnabled = ready && !error;
  const canFit =
    HAS_APPROVED_BASEMAP && mapLoaded && !error && points.length > 0;
  const northAligned = Math.abs(bearing) < 0.5;

  function fitApprovedObservations() {
    const activeMap = mapRef.current;
    if (!activeMap || !canFit) return;
    if (points.length === 1) {
      activeMap.easeTo({ center: points[0].at, zoom: 13, duration: 350 });
      return;
    }
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const point of points) {
      west = Math.min(west, point.at[0]);
      south = Math.min(south, point.at[1]);
      east = Math.max(east, point.at[0]);
      north = Math.max(north, point.at[1]);
    }
    activeMap.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 60, maxZoom: 13, duration: 350 },
    );
  }

  return (
    <div className="relative size-full overflow-hidden bg-[#eef1ec]">
      {ready && !error && (
        <section
          className="absolute inset-0"
          ref={containerRef}
          aria-label="Peta observasi"
        />
      )}

      {(!ready || error) && (
        <div className="gis-schematic absolute inset-0 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-sm rounded-xl border border-line bg-white/95 p-5 shadow-md sm:p-6">
            <div className="mb-3 inline-flex size-10 items-center justify-center rounded-lg bg-warn-50 text-warn">
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6m0 3h.01" />
              </svg>
            </div>
            <p className="text-base font-semibold text-ink">
              {error
                ? "Peta dasar tidak merespons"
                : "Peta dasar belum tersedia"}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {error
                ? "Gaya atau tile peta gagal dimuat. Penanda tidak ditampilkan agar tidak disalahartikan."
                : "Basemap menunggu konfigurasi resmi yang disetujui."}{" "}
              Filter dan daftar observasi tetap dapat digunakan.
            </p>
            <p className="mt-2 text-xs text-muted">
              Koordinat yang dibatasi aksesnya tidak ditampilkan.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {error && (
                <button
                  type="button"
                  onClick={() => {
                    setError(false);
                    setRetryKey((value) => value + 1);
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-white px-3 py-2 text-xs text-ink hover:bg-bg"
                >
                  <svg
                    className="size-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    aria-hidden="true"
                  >
                    <path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5.3" />
                  </svg>
                  Coba lagi
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {LOCAL_SCHEMATIC_PREVIEW && !error && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-md border border-dashed border-[#e7b77c] bg-white/95 px-3 py-1.5 text-[11px] text-[#a66c19] shadow-sm">
          Pratinjau desain · peta skematis sintetis
        </div>
      )}

      {/* Zoom, compass, and Fit share positioning and visibility. */}
      {controlsEnabled && (
        <div className="absolute right-3 top-4 z-20 flex flex-col gap-2">
          <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-white shadow-sm">
            <button
              type="button"
              title="Perbesar peta"
              aria-label="Perbesar peta"
              onClick={() => mapRef.current?.zoomIn()}
              className="flex size-10 items-center justify-center text-ink hover:bg-bg"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <div className="border-t border-line" />
            <button
              type="button"
              title="Perkecil peta"
              aria-label="Perkecil peta"
              onClick={() => mapRef.current?.zoomOut()}
              className="flex size-10 items-center justify-center text-ink hover:bg-bg"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
          <fieldset
            aria-label="Orientasi dan pembingkaian peta"
            className="m-0 flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-white p-0 shadow-sm"
          >
            <button
              type="button"
              title={
                northAligned
                  ? "Peta sudah menghadap utara"
                  : "Hadapkan peta ke utara"
              }
              aria-label="Hadapkan peta ke utara"
              disabled={!mapLoaded}
              onClick={() => mapRef.current?.resetNorth({ duration: 250 })}
              className="flex size-10 items-center justify-center text-ink hover:bg-bg disabled:cursor-not-allowed disabled:text-muted"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: `rotate(${-bearing}deg)` }}
                aria-hidden="true"
              >
                <path d="M12 3.5 16 12l-4 8.5L8 12l4-8.5Z" />
                <path d="M12 3.5 16 12H8l4-8.5Z" fill="currentColor" />
              </svg>
            </button>
            <div className="border-t border-line" />
            <button
              type="button"
              title={
                canFit
                  ? "Paskan ke observasi di peta"
                  : "Tidak ada titik observasi yang disetujui pada peta nyata"
              }
              aria-label="Paskan ke observasi di peta"
              disabled={!canFit}
              onClick={fitApprovedObservations}
              className="flex size-10 items-center justify-center text-ink hover:bg-bg disabled:cursor-not-allowed disabled:text-muted"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
            </button>
          </fieldset>
        </div>
      )}

      {controlsEnabled && (
        <div className="absolute bottom-4 left-3 z-10 max-md:bottom-auto max-md:left-auto max-md:right-3 max-md:top-52">
          <button
            type="button"
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen((open) => !open)}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-xs text-ink shadow-sm hover:bg-bg max-md:size-10 max-md:px-0"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5" />
            </svg>
            <span className="max-md:sr-only">Legenda</span>
          </button>
          {legendOpen && (
            <div className="mt-2 w-52 rounded-md border border-line bg-white p-3 text-xs text-muted shadow-md max-md:absolute max-md:top-0 max-md:right-12 max-md:mt-0">
              <p className="mb-2 font-medium text-ink">Penanda peta</p>
              <p>
                <span className="mr-2 inline-block size-2 rounded-full bg-brand" />
                Hayati
              </p>
              <p className="mt-2">
                <span className="mr-2 inline-block size-2 rounded-full bg-[#3d5870]" />
                Risiko lingkungan
              </p>
              {LOCAL_SCHEMATIC_PREVIEW && (
                <p className="mt-3 text-[11px]">
                  Tidak ada penanda observasi pada peta sintetis.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {ready && !error && (
        <div className="pointer-events-none absolute bottom-0 right-3 z-10 max-w-[65%] truncate rounded-tl-md bg-white/70 px-2 py-0.5 text-right text-[10px] text-muted max-md:right-auto max-md:left-0 max-md:max-w-[calc(100%-4.5rem)] max-md:rounded-tr-md max-md:rounded-tl-none">
          {LOCAL_SCHEMATIC_PREVIEW
            ? "Kartografi sintetis · bukan lokasi nyata · tanpa marker produksi"
            : ATTRIBUTION}
        </div>
      )}
    </div>
  );
}
