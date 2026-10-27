"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState } from "react";

const STYLE = process.env.NEXT_PUBLIC_AUVRION_BASEMAP_STYLE_URL?.trim();
const ATTRIBUTION = process.env.NEXT_PUBLIC_AUVRION_BASEMAP_ATTRIBUTION?.trim();
const WORKER_URL = "/vendor/maplibre/maplibre-gl-worker.mjs";

type Point = { latitude: number; longitude: number };
type OpeningPoint = { latitude: string; longitude: string };

export function ObservationPointPicker({
  latitude,
  longitude,
  onChange,
}: {
  latitude: string;
  longitude: string;
  onChange: (point: Point) => void;
}) {
  const holder = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [openingPoint, setOpeningPoint] = useState<OpeningPoint | null>(null);

  // The latest callback is used without reinitializing MapLibre on every form edit.
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    if (
      !visible ||
      !openingPoint ||
      !STYLE ||
      !ATTRIBUTION ||
      !holder.current
    ) {
      return;
    }

    const latitudeNumber = Number(openingPoint.latitude);
    const longitudeNumber = Number(openingPoint.longitude);
    const valid =
      openingPoint.latitude.trim() !== "" &&
      openingPoint.longitude.trim() !== "" &&
      Number.isFinite(latitudeNumber) &&
      Number.isFinite(longitudeNumber) &&
      Math.abs(latitudeNumber) <= 90 &&
      Math.abs(longitudeNumber) <= 180;

    // Snapshot the coordinates when the picker opens. Form edits must not
    // destroy and recreate the interactive map.
    const initial: [number, number] = valid
      ? [longitudeNumber, latitudeNumber]
      : [117, -2.5];

    let cancelled = false;
    let map: import("maplibre-gl").Map | undefined;

    void import("maplibre-gl")
      .then((lib) => {
        if (cancelled || !holder.current) return;

        lib.setWorkerUrl(WORKER_URL);
        map = new lib.Map({
          container: holder.current,
          style: STYLE,
          center: initial,
          zoom: valid ? 10 : 4,
          attributionControl: { compact: true },
          maxPitch: 0,
        });

        const activeMap = map;
        const marker = new lib.Marker({ color: "#20785f" });
        if (valid) marker.setLngLat(initial).addTo(activeMap);

        activeMap.on("click", (event) => {
          const selectedLatitude = Number(event.lngLat.lat.toFixed(6));
          const selectedLongitude = Number(event.lngLat.lng.toFixed(6));
          marker
            .setLngLat([selectedLongitude, selectedLatitude])
            .addTo(activeMap);
          callback.current({
            latitude: selectedLatitude,
            longitude: selectedLongitude,
          });
        });

        activeMap.on("error", () => {
          if (!cancelled) {
            setError(
              "Tile peta belum berhasil dimuat. Gunakan input koordinat manual.",
            );
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError("Peta tidak tersedia. Gunakan input koordinat manual.");
        }
      });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [visible, openingPoint]);

  function togglePicker() {
    if (!visible) {
      setOpeningPoint({ latitude, longitude });
      setError("");
    }
    setVisible((value) => !value);
  }

  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        onClick={togglePicker}
        aria-expanded={visible}
        className="rounded-md border border-line-strong bg-white px-3 py-2 text-xs font-semibold text-brand hover:bg-bg"
      >
        {visible ? "Tutup pemilih titik" : "Pilih titik pada peta"}
      </button>

      {visible &&
        (!STYLE || !ATTRIBUTION ? (
          <p className="text-xs text-muted" role="status">
            Peta interaktif memerlukan basemap yang disetujui dan atribusinya.
            Input koordinat manual tetap tersedia.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted">
              Klik peta untuk mengisi lintang dan bujur; sesuaikan koordinat
              secara manual bila perlu. Input manual tetap tersedia untuk
              penggunaan keyboard.
            </p>
            <section
              ref={holder}
              className="h-64 w-full overflow-hidden rounded-md border border-line bg-bg"
              aria-label="Pilih titik observasi pada peta"
            />
            {error && (
              <p role="status" className="text-xs text-muted">
                {error}
              </p>
            )}
          </>
        ))}
    </div>
  );
}
