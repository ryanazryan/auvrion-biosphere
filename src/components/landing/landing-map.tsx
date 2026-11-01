"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { SelectMenu } from "@/components/ui/SelectMenu";

type Region =
  | "Indonesia"
  | "Kalimantan"
  | "Sumatra"
  | "Jawa"
  | "Sulawesi"
  | "Papua";
const REGIONS: Record<Region, { center: [number, number]; zoom: number }> = {
  Indonesia: { center: [117.1, -2.4], zoom: 3.35 },
  Kalimantan: { center: [114.8, -0.75], zoom: 5 },
  Sumatra: { center: [101.3, -0.8], zoom: 4.5 },
  Jawa: { center: [110.4, -7.3], zoom: 5.7 },
  Sulawesi: { center: [121, -2.1], zoom: 5 },
  Papua: { center: [137.2, -3.9], zoom: 4.5 },
};

/** Public basemap only. No organization data, auth endpoints, hotspot feeds or invented markers. */
export function LandingWebGis() {
  const targetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [region, setRegion] = useState<Region>("Indonesia");
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    const element = targetRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let disposed = false;
    let instance: MapLibreMap | null = null;
    void import("maplibre-gl")
      .then((maplibregl) => {
        if (disposed || !canvasRef.current) return;
        maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
        const map = new maplibregl.Map({
          container: canvasRef.current,
          style:
            process.env.NEXT_PUBLIC_AUVRION_BASEMAP_STYLE_URL?.trim() ||
            "https://tiles.openfreemap.org/styles/liberty",
          center: REGIONS.Indonesia.center,
          zoom: REGIONS.Indonesia.zoom,
          minZoom: 2.5,
          maxZoom: 14,
          attributionControl: { compact: true },
        });
        instance = map;
        mapRef.current = map;
        map.on("load", () => {
          if (!disposed) {
            setLoaded(true);
            map.resize();
          }
        });
        map.on("error", () => {
          if (!disposed) setFailed(true);
        });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      instance?.remove();
      if (mapRef.current === instance) mapRef.current = null;
    };
  }, [visible]);

  function navigate(next: Region) {
    setRegion(next);
    const selected = REGIONS[next];
    mapRef.current?.flyTo({
      center: selected.center,
      zoom: selected.zoom,
      duration: 850,
      essential: false,
    });
  }

  return (
    <div
      ref={targetRef}
      className="ab-map-viewport relative overflow-hidden bg-[#dce9df]"
    >
      <div
        ref={canvasRef}
        className="h-[320px] w-full sm:h-[415px] lg:h-[430px]"
      />
      {!loaded && !failed && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#e5efe7]/90 text-sm font-medium text-[#355847]">
          Menyiapkan peta interaktif…
        </div>
      )}
      {failed && !loaded && (
        <div className="absolute inset-0 grid place-items-center bg-[#e5efe7] px-5 text-center text-sm text-[#345849]">
          Peta dasar belum dapat dimuat. Periksa koneksi ke penyedia peta.
        </div>
      )}
      {!panelOpen && (
        <button
          type="button"
          className="ab-map-sidebar-reopen"
          aria-label="Buka panel navigasi peta"
          onClick={() => setPanelOpen(true)}
        >
          Wilayah
        </button>
      )}
      {panelOpen && (
        <section
          id="ab-public-map-navigation"
          className="ab-map-sidebar"
          aria-label="Navigasi WebGIS publik"
        >
          <div className="ab-map-sidebar-header">
            <p className="ab-map-sidebar-heading">Peta Observasi</p>
            <button
              type="button"
              className="ab-map-sidebar-close"
              aria-label="Tutup panel navigasi peta"
              onClick={() => setPanelOpen(false)}
            >
              ×
            </button>
          </div>
          <label
            className="ab-map-sidebar-label"
            htmlFor="public-region-trigger"
          >
            Seluruh Wilayah
          </label>
          <SelectMenu
            id="public-region-trigger"
            label="Pilih wilayah WebGIS publik"
            value={region}
            onChange={navigate}
            options={(Object.keys(REGIONS) as Region[]).map((value) => ({
              value,
              label: value,
            }))}
            className="ab-map-select"
          />
          <div className="ab-map-sidebar-separator" />
          <div className="ab-map-layer-label">
            <span className="ab-map-layer-dot" /> Peta dasar Indonesia
          </div>
          <div className="ab-map-layer-desc">
            Geser peta untuk melihat detail wilayah. Gunakan zoom atau dropdown.
          </div>
        </section>
      )}
      {loaded && (
        <fieldset
          className="ab-map-zoom absolute right-3 bottom-11 z-10 flex flex-col gap-1.5 rounded-xl border border-white/80 bg-white/95 p-1.5 shadow-lg sm:right-4"
          aria-label="Kontrol zoom peta"
        >
          <button
            type="button"
            className="grid size-9 place-items-center rounded-lg text-lg font-medium text-[#174a37] hover:bg-[#e8f3eb]"
            aria-label="Perbesar peta"
            onClick={() => mapRef.current?.zoomIn()}
          >
            +
          </button>
          <div className="h-px bg-[#e0eae3]" />
          <button
            type="button"
            className="grid size-9 place-items-center rounded-lg text-lg font-medium text-[#174a37] hover:bg-[#e8f3eb]"
            aria-label="Perkecil peta"
            onClick={() => mapRef.current?.zoomOut()}
          >
            −
          </button>
        </fieldset>
      )}
    </div>
  );
}
