"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapLocationControls } from "@/components/gis/MapLocationControls";
import type { MapNavigationTarget } from "@/components/gis/map-navigation";

type Installation = {
  id: string;
  code: string;
  label: string;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  verificationMethod: string | null;
  disclosureApproved: boolean;
};
type FleetResponse = { organizationId?: string; error?: string };
type LocationsResponse = { devices?: Installation[]; error?: string };
type MapLib = typeof import("maplibre-gl");
const INDONESIA_CENTER: [number, number] = [117, -2.5];

function validPoint(
  device: Installation,
): device is Installation & { latitude: number; longitude: number } {
  return (
    typeof device.latitude === "number" &&
    Number.isFinite(device.latitude) &&
    device.latitude >= -90 &&
    device.latitude <= 90 &&
    typeof device.longitude === "number" &&
    Number.isFinite(device.longitude) &&
    device.longitude >= -180 &&
    device.longitude <= 180
  );
}

function Icon({
  name,
  size = 18,
}: {
  name: "pin" | "target" | "refresh" | "eye" | "eye-off" | "chevron";
  size?: number;
}) {
  const shapes = {
    pin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5.6 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.4-2" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    "eye-off": (
      <>
        <path d="m3 3 18 18M10.5 5.2A11 11 0 0 1 12 5c6 0 10 7 10 7a15 15 0 0 1-3 3.7M6 6.8C3.5 8.7 2 12 2 12s4 7 10 7a10 10 0 0 0 4-1" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes[name]}
    </svg>
  );
}

/** Admin-only LISTEN installation map. Operator GIS files and layers are untouched. */
export function AdminEnvironmentMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const libRef = useRef<MapLib | null>(null);
  const markersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [devices, setDevices] = useState<Installation[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [dataError, setDataError] = useState("");
  const [mapError, setMapError] = useState("");
  const [navigation, setNavigation] = useState<MapNavigationTarget | null>(
    null,
  );

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setDataError("");
    try {
      const fleetResponse = await fetch("/api/admin/device-fleet", {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      const fleet = (await fleetResponse.json()) as FleetResponse;
      if (!fleetResponse.ok || !fleet.organizationId) {
        throw new Error(fleet.error ?? `HTTP ${fleetResponse.status}`);
      }
      const params = new URLSearchParams({
        organizationId: fleet.organizationId,
      });
      const result = await fetch(`/api/admin/listen-locations?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      const payload = (await result.json()) as LocationsResponse;
      if (!result.ok || !Array.isArray(payload.devices)) {
        throw new Error(payload.error ?? `HTTP ${result.status}`);
      }
      if (!signal.aborted) {
        setOrganizationId(fleet.organizationId);
        setDevices(payload.devices);
      }
    } catch (error) {
      if (!signal.aborted)
        setDataError(
          error instanceof Error
            ? error.message
            : "Gagal mengambil lokasi perangkat.",
        );
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshIndex; // Manual reload, same approach as Operator GIS.
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshIndex]);

  useEffect(() => {
    if (!mapContainer.current) return;
    let disposed = false;
    void import("maplibre-gl")
      .then((lib) => {
        if (disposed || !mapContainer.current) return;
        lib.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
        libRef.current = lib;
        const map = new lib.Map({
          container: mapContainer.current,
          style:
            process.env.NEXT_PUBLIC_AUVRION_BASEMAP_STYLE_URL?.trim() ||
            "https://tiles.openfreemap.org/styles/liberty",
          center: INDONESIA_CENTER,
          zoom: 4,
          attributionControl: {},
          maxPitch: 0,
        });
        mapRef.current = map;
        map.addControl(new lib.NavigationControl(), "bottom-right");
        map.on("load", () => {
          if (!disposed) setMapReady(true);
        });
        map.on("error", () => {
          if (!disposed)
            setMapError(
              "Peta tidak dapat memuat sebagian data. Periksa koneksi dan aset MapLibre.",
            );
        });
      })
      .catch(() => {
        if (!disposed)
          setMapError(
            "Peta gagal dimuat. Jalankan npm run predev lalu muat ulang.",
          );
      });
    return () => {
      disposed = true;
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      libRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !libRef.current) return;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    if (!showPins) return;
    for (const device of devices.filter(validPoint)) {
      const button = document.createElement("button");
      button.type = "button";
      button.title = `${device.label} · ${device.locationLabel ?? "Lokasi pemasangan"}`;
      button.setAttribute("aria-label", `Fokus perangkat ${device.label}`);
      button.className =
        "grid size-10 place-items-center rounded-xl border-2 border-white bg-[#147a5b] shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
      const img = document.createElement("img");
      img.src = "/device-illustrations/listen-device.png";
      img.alt = "";
      img.width = 29;
      img.height = 29;
      img.style.objectFit = "contain";
      button.append(img);
      button.addEventListener("click", () => {
        setSelectedId(device.id);
        mapRef.current?.flyTo({
          center: [device.longitude, device.latitude],
          zoom: 14,
          essential: true,
        });
      });
      const marker = new libRef.current.Marker({
        element: button,
        anchor: "bottom",
      })
        .setLngLat([device.longitude, device.latitude])
        .addTo(mapRef.current);
      markersRef.current.push(marker);
    }
  }, [devices, mapReady, showPins]);

  useEffect(() => {
    if (!navigation || !mapReady) return;
    mapRef.current?.flyTo({
      center: [navigation.longitude, navigation.latitude],
      zoom: 13,
      essential: true,
    });
  }, [navigation, mapReady]);

  const positioned = devices.filter(validPoint);
  const shown = devices.filter((device) =>
    `${device.label} ${device.code} ${device.locationLabel ?? ""}`
      .toLocaleLowerCase("id-ID")
      .includes(search.trim().toLocaleLowerCase("id-ID")),
  );
  const selected = devices.find((d) => d.id === selectedId) ?? null;
  function focus(device: Installation) {
    setSelectedId(device.id);
    if (!validPoint(device)) return;
    mapRef.current?.flyTo({
      center: [device.longitude, device.latitude],
      zoom: 14,
      essential: true,
    });
  }
  function focusAll() {
    if (!mapRef.current || positioned.length === 0) return;
    if (positioned.length === 1) {
      focus(positioned[0]);
      return;
    }
    mapRef.current.fitBounds(
      [
        [
          Math.min(...positioned.map((d) => d.longitude)),
          Math.min(...positioned.map((d) => d.latitude)),
        ],
        [
          Math.max(...positioned.map((d) => d.longitude)),
          Math.max(...positioned.map((d) => d.latitude)),
        ],
      ],
      { padding: 70, maxZoom: 13 },
    );
  }

  return (
    <section
      aria-label="Peta lokasi perangkat IoT"
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Peta lingkungan</h1>
          <p className="mt-1 text-xs text-muted">
            Navigasi dan lokasi fisik perangkat LISTEN · khusus Admin
          </p>
        </div>
        <Link
          href="/admin/devices"
          className="rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold text-brand hover:bg-bg"
        >
          Kelola perangkat
        </Link>
      </div>
      {dataError && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800"
        >
          Gagal memuat lokasi: {dataError}
        </p>
      )}
      <div className="relative isolate flex h-[min(72vh,760px)] min-h-[500px] min-w-0 overflow-hidden rounded-xl border border-line bg-white max-md:h-[75vh]">
        <aside
          aria-label="Daftar lokasi perangkat"
          className={`z-10 flex shrink-0 flex-col overflow-hidden border-r border-line bg-white transition-[width] duration-200 ${collapsed ? "w-12" : "w-[min(33vw,360px)] max-md:w-[min(46vw,290px)]"}`}
        >
          {collapsed ? (
            <button
              type="button"
              aria-label="Buka panel perangkat"
              title="Buka daftar perangkat"
              onClick={() => setCollapsed(false)}
              className="grid size-11 place-items-center text-brand hover:bg-bg"
            >
              <Icon name="chevron" />
            </button>
          ) : (
            <>
              <div className="border-b border-line px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">
                    Lokasi perangkat ({devices.length})
                  </h2>
                  <button
                    type="button"
                    aria-label="Tutup panel perangkat"
                    title="Tutup panel"
                    onClick={() => setCollapsed(true)}
                    className="grid size-8 place-items-center rounded-md text-muted hover:bg-bg"
                  >
                    <span aria-hidden="true" className="rotate-180">
                      <Icon name="chevron" />
                    </span>
                  </button>
                </div>
                <label className="mt-3 flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-white px-3 transition-colors focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/10">
                  <span className="sr-only">Cari nama atau kode perangkat</span>
                  <Icon name="pin" size={15} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari perangkat atau lokasi…"
                    data-auvrion-focus-inner
                    className="min-w-0 flex-1 border-0 bg-transparent text-xs text-ink outline-none placeholder:text-muted focus:outline-none focus-visible:outline-none"
                  />
                </label>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {loading && (
                  <p className="p-3 text-xs text-muted">Memuat perangkat…</p>
                )}
                {!loading && shown.length === 0 && (
                  <p className="p-3 text-xs text-muted">
                    Belum ada perangkat yang cocok.
                  </p>
                )}
                {shown.map((device) => {
                  const placed = validPoint(device);
                  return (
                    <button
                      key={device.id}
                      type="button"
                      onClick={() => focus(device)}
                      aria-pressed={device.id === selectedId}
                      className={`flex w-full items-start gap-2 rounded-lg border p-2 text-left transition-colors hover:border-brand/40 hover:bg-bg ${device.id === selectedId ? "border-[#99cbb0] bg-[#edf7ef]" : "border-line bg-white"}`}
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-[#eef5f0]">
                        <Image
                          src="/device-illustrations/listen-device.png"
                          width={38}
                          height={38}
                          alt=""
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-xs font-semibold text-ink">
                          {device.label}
                        </span>
                        <span className="mt-1 block break-all text-[11px] text-muted">
                          {device.code}
                        </span>
                        <span
                          className={`mt-1 block text-[11px] ${placed ? "text-[#197657]" : "text-[#94703f]"}`}
                        >
                          {placed
                            ? (device.locationLabel ?? "Lokasi terpasang")
                            : "Lokasi belum dicatat"}
                        </span>
                      </span>
                      <Icon name="chevron" size={15} />
                    </button>
                  );
                })}
              </div>
              {selected && (
                <div className="border-t border-line bg-[#f7faf8] p-3 text-xs leading-5">
                  <h3 className="font-semibold">{selected.label}</h3>
                  <p className="mt-1 text-muted">
                    {selected.locationLabel ?? "Lokasi belum dicatat"}
                  </p>
                  {validPoint(selected) ? (
                    <p className="mt-1 font-mono text-[11px] text-ink">
                      {selected.latitude.toFixed(6)},{" "}
                      {selected.longitude.toFixed(6)}
                    </p>
                  ) : (
                    <p className="mt-1 text-muted">Koordinat belum tersedia</p>
                  )}
                  <p className="mt-1 text-[11px] text-muted">
                    {selected.disclosureApproved
                      ? "Publikasi lokasi disetujui"
                      : "Koordinat hanya tersedia untuk Admin"}
                  </p>
                  <Link
                    href={`/admin/listen-locations?deviceId=${encodeURIComponent(selected.id)}`}
                    className="mt-2 inline-block font-semibold text-brand hover:underline"
                  >
                    Atur lokasi perangkat
                  </Link>
                </div>
              )}
            </>
          )}
        </aside>
        <div className="relative min-w-0 flex-1 bg-[#ecf2ed]">
          <div
            ref={mapContainer}
            role="application"
            aria-label="Peta instalasi perangkat LISTEN"
            className="absolute inset-0"
          />
          <div className="pointer-events-auto absolute left-3 top-3 z-20 flex gap-1.5 rounded-lg border border-line bg-white/95 p-1 shadow-md">
            <button
              type="button"
              aria-label={
                showPins ? "Sembunyikan marker IoT" : "Tampilkan marker IoT"
              }
              title="Tampilkan/sembunyikan lokasi IoT"
              aria-pressed={showPins}
              onClick={() => setShowPins((v) => !v)}
              className={`grid size-9 place-items-center rounded-md ${showPins ? "bg-[#e7f4ec] text-brand" : "text-muted hover:bg-bg"}`}
            >
              <Icon name={showPins ? "eye" : "eye-off"} />
            </button>
            <button
              type="button"
              aria-label="Fokus semua perangkat"
              title="Fokus perangkat"
              disabled={!mapReady || positioned.length === 0}
              onClick={focusAll}
              className="grid size-9 place-items-center rounded-md text-ink hover:bg-bg disabled:opacity-40"
            >
              <Icon name="target" />
            </button>
            <button
              type="button"
              aria-label="Muat ulang lokasi"
              title="Muat ulang lokasi"
              disabled={loading}
              onClick={() => setRefreshIndex((v) => v + 1)}
              className="grid size-9 place-items-center rounded-md text-ink hover:bg-bg disabled:opacity-40"
            >
              <Icon name="refresh" />
            </button>
          </div>
          {organizationId && (
            <MapLocationControls
              organizationId={organizationId}
              onNavigate={setNavigation}
              iotLocationCount={positioned.length}
            />
          )}
          {mapError && (
            <p
              role="status"
              className="absolute bottom-3 left-3 right-3 z-30 rounded-md bg-white p-3 text-xs text-amber-800 shadow"
            >
              {mapError}
            </p>
          )}
          {!loading && devices.length > 0 && positioned.length === 0 && (
            <div className="pointer-events-none absolute bottom-4 left-3 z-20 max-w-[280px] rounded-lg border border-line bg-white/95 p-3 text-xs text-muted shadow-sm">
              Belum ada lokasi pemasangan yang disimpan. Pilih LISTEN di panel
              kiri untuk mengisi lokasinya.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
