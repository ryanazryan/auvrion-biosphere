"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState } from "react";

type Position = {
  latitude: number;
  longitude: number;
  mode: string;
  locationType: "observation_point";
};

type LocationStatus = "idle" | "loading" | "ready" | "denied" | "error";

const STYLE_URL = process.env.NEXT_PUBLIC_AUVRION_BASEMAP_STYLE_URL?.trim();

const WORKER_URL = "/vendor/maplibre/maplibre-gl-worker.mjs";

/**
 * Role-scoped location preview.
 *
 * Precise coordinates are fetched only through the
 * authorized observation location endpoint.
 *
 * Biodiversity location disclosure is controlled
 * by the server, not this component.
 */
export function ObservationLocationMap({
  organizationId,
  observationId,
}: {
  organizationId: string;
  observationId: string;
}) {
  const [open, setOpen] = useState(false);

  const [status, setStatus] = useState<LocationStatus>("idle");

  const scope = `${organizationId}:${observationId}`;

  const [storedPoint, setStoredPoint] = useState<
    (Position & { scope: string }) | null
  >(null);

  const point = storedPoint?.scope === scope ? storedPoint : null;

  const containerRef = useRef<HTMLDivElement>(null);

  const mapRef = useRef<import("maplibre-gl").Map | null>(null);

  /*
   * Fetch the location only after the user
   * explicitly opens the preview.
   */
  useEffect(() => {
    if (!open || point) return;

    const controller = new AbortController();

    setStatus("loading");

    const qs = new URLSearchParams({
      organizationId,
    });

    void (async () => {
      try {
        const response = await fetch(
          `/api/observations/${encodeURIComponent(
            observationId,
          )}/location?${qs}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) return;

        if (response.status === 403 || response.status === 404) {
          setStatus("denied");
          return;
        }

        if (!response.ok) {
          throw new Error("LOCATION_UNAVAILABLE");
        }

        const data = (await response.json()) as Position;

        if (
          !Number.isFinite(data.latitude) ||
          !Number.isFinite(data.longitude) ||
          data.latitude < -90 ||
          data.latitude > 90 ||
          data.longitude < -180 ||
          data.longitude > 180 ||
          data.locationType !== "observation_point"
        ) {
          throw new Error("INVALID_LOCATION");
        }

        if (controller.signal.aborted) return;

        setStoredPoint({
          ...data,
          scope,
        });

        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) {
          setStatus("error");
        }
      }
    })();

    return () => controller.abort();
  }, [open, point, organizationId, observationId, scope]);

  /*
   * Initialize MapLibre with the same local
   * Web Worker used by GisMapCanvas.
   */
  useEffect(() => {
    if (!open || !point || !STYLE_URL || !containerRef.current) {
      return;
    }

    let disposed = false;

    let map: import("maplibre-gl").Map | null = null;

    void import("maplibre-gl")
      .then((maplibregl) => {
        if (disposed || !containerRef.current) {
          return;
        }

        // Important: configure the worker before
        // constructing a MapLibre instance.
        maplibregl.setWorkerUrl(WORKER_URL);

        map = new maplibregl.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [point.longitude, point.latitude],
          zoom: 11,
          attributionControl: {
            compact: true,
          },
          interactive: false,
          maxPitch: 0,
        });

        mapRef.current = map;

        const activeMap = map;

        new maplibregl.Marker({
          color: "#20785f",
        })
          .setLngLat([point.longitude, point.latitude])
          .addTo(activeMap);

        activeMap.on("error", (event) => {
          if (disposed) return;

          console.error("Observation location map error:", event.error);
        });
      })
      .catch((error: unknown) => {
        if (disposed) return;

        console.error("Observation location map initialization failed:", error);

        setStatus("error");
      });

    return () => {
      disposed = true;

      map?.remove();

      if (mapRef.current === map) {
        mapRef.current = null;
      }
    };
  }, [open, point]);

  return (
    <section className="mt-3 min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center rounded-md border border-line bg-white px-3 py-2 text-xs font-medium text-brand transition-colors hover:bg-bg"
      >
        {open ? "Tutup peta lokasi" : "Lihat lokasi observasi"}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {status === "loading" && (
            <p role="status" className="text-xs text-muted">
              Memuat lokasi observasi…
            </p>
          )}

          {status === "denied" && (
            <p className="text-xs leading-5 text-muted">
              Lokasi presisi tidak tersedia untuk akses atau kebijakan observasi
              ini.
            </p>
          )}

          {status === "error" && (
            <p role="alert" className="text-xs text-danger">
              Peta lokasi belum tersedia.
            </p>
          )}

          {point && (
            <>
              {STYLE_URL && status === "ready" ? (
                <div
                  ref={containerRef}
                  role="img"
                  aria-label="Peta titik observasi"
                  className="h-48 w-full overflow-hidden rounded-lg border border-line bg-bg"
                />
              ) : !STYLE_URL ? (
                <p className="text-xs text-muted">
                  Peta dasar belum dikonfigurasi.
                </p>
              ) : null}

              <div className="space-y-1">
                <p className="text-xs font-medium text-ink">
                  {point.mode === "simulation"
                    ? "Titik observasi simulasi"
                    : "Titik observasi"}
                </p>

                <p className="font-mono text-[11px] tabular-nums text-muted">
                  {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
