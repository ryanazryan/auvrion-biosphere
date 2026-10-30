"use client";

import type { MultiPolygonGeometry } from "@/types/geojson";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

type Location = {
  zone: { code: string; name: string };
  point: { latitude: number; longitude: number; label: string } | null;
  geometry: MultiPolygonGeometry | null;
  locationType:
    | "listen_installation"
    | "environmental_observation"
    | "zone_only";
  verifiedAt: string | null;
  incidentConfirmed: false;
  disclosure: "approved" | "zone_only";
};
const STYLE_URL = process.env.NEXT_PUBLIC_AUVRION_BASEMAP_STYLE_URL?.trim();
const WORKER_URL = "/vendor/maplibre/maplibre-gl-worker.mjs";

export function RangerTaskLocationMap({
  taskId,
  organizationId,
}: {
  taskId: string;
  organizationId: string;
}) {
  const [location, setLocation] = useState<Location | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLocation(null);
    setError(null);
    const qs = new URLSearchParams({ organizationId });
    void fetch(
      `/api/ranger/tasks/${encodeURIComponent(taskId)}/location?${qs}`,
      {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Lokasi belum tersedia (${response.status}).`);
        return response.json() as Promise<Location>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (
          data.point &&
          (!Number.isFinite(data.point.latitude) ||
            !Number.isFinite(data.point.longitude) ||
            Math.abs(data.point.latitude) > 90 ||
            Math.abs(data.point.longitude) > 180)
        )
          throw new Error("Respons koordinat tidak valid.");
        setLocation(data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Peta lokasi belum tersedia untuk penugasan ini.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [organizationId, taskId]);

  useEffect(() => {
    if (!location?.point || !STYLE_URL || !containerRef.current) return;
    let disposed = false;
    let map: import("maplibre-gl").Map | null = null;
    void import("maplibre-gl")
      .then((gl) => {
        if (disposed || !containerRef.current || !location.point) return;
        gl.setWorkerUrl(WORKER_URL);
        const point = location.point;
        const instance = new gl.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [point.longitude, point.latitude],
          zoom: 14,
          interactive: false,
          attributionControl: { compact: true },
          maxPitch: 0,
        });
        map = instance;
        instance.on("load", () => {
          if (disposed) return;
          new gl.Marker({ color: "#20785f" })
            .setLngLat([point.longitude, point.latitude])
            .addTo(instance);
          if (location.geometry) {
            instance.addSource("ranger-task-zone", {
              type: "geojson",
              data: {
                type: "Feature",
                geometry: location.geometry,
                properties: {},
              },
            });
            instance.addLayer({
              id: "ranger-task-zone-fill",
              type: "fill",
              source: "ranger-task-zone",
              paint: { "fill-color": "#20785f", "fill-opacity": 0.12 },
            });
            instance.addLayer({
              id: "ranger-task-zone-boundary",
              type: "line",
              source: "ranger-task-zone",
              paint: { "line-color": "#20785f", "line-width": 2 },
            });
          }
        });
      })
      .catch(() => {
        if (!disposed) setError("MapLibre tidak berhasil dimuat.");
      });
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [location]);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Lokasi penugasan</h2>
        <p className="mt-1 text-xs text-muted">
          Lokasi instalasi atau area kerja yang disetujui, bukan titik pasti
          sumber suara.
        </p>
      </div>
      <div className="space-y-3 p-4">
        {loading && (
          <p role="status" className="text-xs text-muted">
            Memuat lokasi tugas…
          </p>
        )}
        {error && (
          <p role="status" className="text-xs text-muted">
            {error}
          </p>
        )}
        {location && (
          <>
            <p className="text-sm font-semibold text-ink">
              {location.zone.name}
            </p>
            <p className="text-xs text-muted">{location.zone.code}</p>
            {location.point && STYLE_URL ? (
              <div
                ref={containerRef}
                role="img"
                aria-label="Peta area dan lokasi penugasan"
                className="h-56 w-full overflow-hidden rounded-lg border border-line bg-bg sm:h-64"
              />
            ) : (
              <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-line bg-bg p-4 text-center text-xs text-muted">
                {location.disclosure === "zone_only"
                  ? "Koordinat presisi belum diizinkan untuk Ranger. Area penugasan tersedia tanpa pin."
                  : "Basemap belum dikonfigurasi."}
              </div>
            )}
            {location.point && (
              <p className="text-xs text-muted">
                {location.locationType === "listen_installation"
                  ? "Instalasi LISTEN"
                  : "Titik observasi"}
                : {location.point.label}
                {location.verifiedAt &&
                  ` · Diverifikasi ${new Intl.DateTimeFormat("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Makassar",
                  }).format(new Date(location.verifiedAt))} WITA`}
              </p>
            )}
            <p className="text-[11px] leading-5 text-muted">
              Marker tidak menyatakan terjadinya penebangan atau sumber suara
              yang telah terkonfirmasi.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
