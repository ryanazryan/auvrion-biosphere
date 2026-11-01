"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

const REGIONS = {
  Kalimantan: { center: [114.6, -1.6] as [number, number], zoom: 5 },
  Sumatra: { center: [101.3, -0.8] as [number, number], zoom: 4.5 },
  Jawa: { center: [110.4, -7.3] as [number, number], zoom: 5.7 },
  Sulawesi: { center: [121, -2.1] as [number, number], zoom: 5 },
  Papua: { center: [137.2, -3.9] as [number, number], zoom: 4.5 },
};
type Region = keyof typeof REGIONS;

/** Public basemap only. No live organization layers, endpoints or private coordinates. */
export function RoleDemoMap() {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [region, setRegion] = useState<Region>("Kalimantan");
  const [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false;
    let instance: MapLibreMap | null = null;
    void import("maplibre-gl")
      .then((lib) => {
        if (disposed || !element.current) return;
        lib.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
        const view = new lib.Map({
          container: element.current,
          style:
            process.env.NEXT_PUBLIC_AUVRION_BASEMAP_STYLE_URL?.trim() ||
            "https://tiles.openfreemap.org/styles/liberty",
          center: REGIONS.Kalimantan.center,
          zoom: REGIONS.Kalimantan.zoom,
          attributionControl: { compact: true },
        });
        instance = view;
        map.current = view;
        view.on("error", () => {
          if (!disposed) setError(true);
        });
        view.addControl(
          new lib.NavigationControl({ showCompass: false }),
          "top-right",
        );
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      instance?.remove();
      if (map.current === instance) map.current = null;
    };
  }, []);
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Peta Lingkungan</h2>
        <label className="flex items-center gap-2 text-xs text-muted">
          Wilayah
          <select
            value={region}
            onChange={(e) => {
              const next = e.target.value as Region;
              setRegion(next);
              map.current?.flyTo({
                center: REGIONS[next].center,
                zoom: REGIONS[next].zoom,
                duration: 700,
              });
            }}
            className="rounded-md border border-line-strong bg-white px-3 py-2 text-xs text-ink"
          >
            {(Object.keys(REGIONS) as Region[]).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div
        className="relative h-[340px] bg-[#dce9df] sm:h-[470px]"
        ref={element}
      >
        {error && (
          <div className="pointer-events-none absolute bottom-4 left-4 rounded bg-white/95 px-3 py-2 text-xs text-ink">
            Koneksi peta belum tersedia.
          </div>
        )}
      </div>
    </section>
  );
}
