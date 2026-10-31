"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapLocationControls } from "@/components/gis/MapLocationControls";
import type { MapNavigationTarget } from "@/components/gis/map-navigation";

type Installation = {
  id: string;
  code: string;
  label: string;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  verifiedAt?: string | null;
  verificationMethod: string | null;
  disclosureApproved: boolean;
};
type FleetResponse = { organizationId?: string; error?: string };
type LocationsResponse = { devices?: Installation[]; error?: string };
type MapLib = typeof import("maplibre-gl");

const INDONESIA_CENTER: [number, number] = [117, -2.5];
const DEVICE_IMAGE = "/device-illustrations/listen-device.png";

function hasCoordinates(
  d: Installation,
): d is Installation & { latitude: number; longitude: number } {
  return (
    typeof d.latitude === "number" &&
    Number.isFinite(d.latitude) &&
    d.latitude >= -12 &&
    d.latitude <= 8 &&
    typeof d.longitude === "number" &&
    Number.isFinite(d.longitude) &&
    d.longitude >= 94 &&
    d.longitude <= 142
  );
}

function formatWita(value?: string | null) {
  if (!value) return "Belum tersedia";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Belum tersedia";
  return `${new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)} WITA`;
}

function Glyph({
  name,
  size = 18,
}: {
  name:
    | "search"
    | "pin"
    | "target"
    | "refresh"
    | "eye"
    | "eye-off"
    | "panel-open"
    | "panel-close"
    | "chevron";
  size?: number;
}) {
  const shapes = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
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
    "panel-open": (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16m5-12 4 4-4 4" />
      </>
    ),
    "panel-close": (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M15 4v16m-4-12-4 4 4 4" />
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

function ToolButton({
  name,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  name: "target" | "refresh" | "eye" | "eye-off";
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={name === "eye" || name === "eye-off" ? active : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40 ${active ? "bg-brand-50 text-brand" : "text-fg hover:bg-bg"}`}
    >
      <Glyph name={name} size={17} />
    </button>
  );
}

/** Admin-only installation coordinates. Never infer animal observation coordinates. */
export function AdminEnvironmentMap({ demo = false }: { demo?: boolean } = {}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const libRef = useRef<MapLib | null>(null);
  const markersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const searchMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [devices, setDevices] = useState<Installation[]>([]);
  const [query, setQuery] = useState("");
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

  const fetchLocations = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setDataError("");
      if (demo) {
        setOrganizationId(""); // Do not mount privileged MapLocationControls.
        setDevices([
          {
            id: "demo-pin-1",
            code: "listen-esp32-demo-01",
            label: "LISTEN ESP32 (Simulasi)",
            locationLabel: "Kalimantan — titik ilustratif",
            latitude: -3.5,
            longitude: 114.5,
            verifiedAt: null,
            verificationMethod: "simulated",
            disclosureApproved: true,
          },
          {
            id: "demo-pin-2",
            code: "listen-esp32-demo-02",
            label: "LISTEN Cadangan (Simulasi)",
            locationLabel: "Kalimantan — titik ilustratif",
            latitude: -2.6,
            longitude: 115.1,
            verifiedAt: null,
            verificationMethod: "simulated",
            disclosureApproved: true,
          },
        ]);
        setLoading(false);
        return;
      }
      try {
        const inventory = await fetch("/api/admin/device-fleet", {
          credentials: "same-origin",
          cache: "no-store",
          signal,
        });
        const fleet = (await inventory.json()) as FleetResponse;
        if (!inventory.ok || !fleet.organizationId) {
          throw new Error(fleet.error ?? `HTTP ${inventory.status}`);
        }
        const params = new URLSearchParams({
          organizationId: fleet.organizationId,
        });
        const response = await fetch(`/api/admin/listen-locations?${params}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal,
        });
        const result = (await response.json()) as LocationsResponse;
        if (!response.ok || !Array.isArray(result.devices)) {
          throw new Error(result.error ?? `HTTP ${response.status}`);
        }
        if (!signal.aborted) {
          setOrganizationId(fleet.organizationId);
          setDevices(result.devices);
        }
      } catch (error) {
        if (!signal.aborted) {
          setDataError(
            error instanceof Error
              ? error.message
              : "Gagal memuat lokasi perangkat.",
          );
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [demo],
  );

  useEffect(() => {
    void refreshIndex; // Deliberate manual refresh trigger, as used in Operator GIS.
    const controller = new AbortController();
    void fetchLocations(controller.signal);
    return () => controller.abort();
  }, [fetchLocations, refreshIndex]);

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
        const missingIcons = new Set(["lift_gate", "office", "atm", "gate"]);

        map.setMissingStyleImageResolver((id) => {
          if (!missingIcons.has(id) || map.hasImage(id)) return;

          // Fallback sederhana untuk ikon POI dari penyedia basemap.
          const size = 24;
          const data = new Uint8Array(size * size * 4);

          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const dx = x - size / 2 + 0.5;
              const dy = y - size / 2 + 0.5;
              const radius = Math.sqrt(dx * dx + dy * dy);

              if (radius > 9) continue;

              const index = (y * size + x) * 4;
              const border = radius >= 7;

              data[index] = border ? 255 : 49;
              data[index + 1] = border ? 255 : 112;
              data[index + 2] = border ? 255 : 87;
              data[index + 3] = 255;
            }
          }

          map.addImage(id, {
            width: size,
            height: size,
            data,
          });
        });
        mapRef.current = map;
        map.addControl(new lib.NavigationControl(), "bottom-right");
        map.on("load", () => {
          if (!disposed) setMapReady(true);
        });
        map.on("error", () => {
          if (!disposed)
            setMapError(
              "Sebagian data peta tidak dapat dimuat. Periksa koneksi MapLibre.",
            );
        });
      })
      .catch(() => {
        if (!disposed)
          setMapError(
            "Peta gagal dimuat. Jalankan npm run predev, lalu muat ulang.",
          );
      });
    return () => {
      disposed = true;
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      searchMarkerRef.current?.remove();
      searchMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      libRef.current = null;
    };
  }, []);

  const positioned = useMemo(() => devices.filter(hasCoordinates), [devices]);
  const shown = useMemo(
    () =>
      devices.filter((device) =>
        `${device.label} ${device.code} ${device.locationLabel ?? ""}`
          .toLocaleLowerCase("id-ID")
          .includes(query.trim().toLocaleLowerCase("id-ID")),
      ),
    [devices, query],
  );
  const focus = useCallback((device: Installation) => {
    setSelectedId(device.id);
    if (!hasCoordinates(device)) return;
    mapRef.current?.flyTo({
      center: [device.longitude, device.latitude],
      zoom: 15,
      essential: true,
    });
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !libRef.current) return;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    if (!showPins) return;
    const lib = libRef.current;
    const map = mapRef.current;
    for (const device of positioned) {
      const selected = device.id === selectedId;
      const markerButton = document.createElement("button");
      markerButton.type = "button";
      markerButton.title = `${device.label} · ${device.locationLabel ?? "Lokasi pemasangan"}`;
      markerButton.setAttribute(
        "aria-label",
        `Fokus perangkat ${device.label}`,
      );
      markerButton.setAttribute("aria-pressed", String(selected));
      markerButton.className = `grid size-12 place-items-center rounded-xl border-2 bg-white shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${selected ? "scale-110 border-brand ring-4 ring-brand/20" : "border-white"}`;
      const image = document.createElement("img");
      image.src = DEVICE_IMAGE;
      image.alt = "";
      image.width = 38;
      image.height = 38;
      image.style.objectFit = "contain";
      markerButton.append(image);
      markerButton.addEventListener("click", () => focus(device));
      const marker = new lib.Marker({ element: markerButton, anchor: "bottom" })
        .setLngLat([device.longitude, device.latitude])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [positioned, mapReady, showPins, selectedId, focus]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !libRef.current) return;
    searchMarkerRef.current?.remove();
    searchMarkerRef.current = null;
    if (!navigation) return;
    const map = mapRef.current;
    map.flyTo({
      center: [navigation.longitude, navigation.latitude],
      zoom: 14,
      essential: true,
    });
    const pin = document.createElement("div");
    pin.className =
      "grid size-8 place-items-center rounded-full border-[3px] border-white bg-[#7c3aed] text-white shadow-lg";
    pin.title = navigation.label;
    pin.setAttribute("aria-label", `Hasil pencarian: ${navigation.label}`);
    pin.innerHTML =
      '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2"/></svg>';
    searchMarkerRef.current = new libRef.current.Marker({
      element: pin,
      anchor: "bottom",
    })
      .setLngLat([navigation.longitude, navigation.latitude])
      .addTo(map);
  }, [mapReady, navigation]);

  const focusAll = useCallback(() => {
    const map = mapRef.current;
    if (!map || positioned.length === 0) return;
    if (positioned.length === 1) {
      focus(positioned[0]);
      return;
    }
    const longs = positioned.map((d) => d.longitude);
    const lats = positioned.map((d) => d.latitude);
    map.fitBounds(
      [
        [Math.min(...longs), Math.min(...lats)],
        [Math.max(...longs), Math.max(...lats)],
      ],
      { padding: 70, maxZoom: 14 },
    );
  }, [focus, positioned]);

  return (
    <section
      aria-label="Peta lokasi perangkat IoT"
      className="flex min-w-0 flex-col gap-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight text-ink">
            Peta lingkungan
          </h1>
          <p className="mt-1 text-xs text-muted">
            Lokasi pemasangan perangkat LISTEN · hanya untuk Admin
          </p>
        </div>
        <Link
          href="/admin/devices"
          className="rounded-md border border-line-strong bg-white px-3 py-2 text-xs font-medium text-brand hover:bg-bg"
        >
          Kelola perangkat
        </Link>
      </header>
      {dataError && (
        <p
          role="alert"
          className="rounded-md border border-danger/20 bg-danger-50 px-4 py-3 text-sm text-danger"
        >
          Lokasi tidak dapat dimuat: {dataError}
        </p>
      )}
      <div className="relative isolate flex h-[min(74vh,780px)] min-h-[520px] min-w-0 overflow-hidden border border-line bg-white max-md:h-[75vh] max-md:min-h-[470px]">
        <aside
          aria-label="Daftar perangkat dan lokasi pemasangan"
          className={`z-10 flex shrink-0 flex-col overflow-hidden border-r border-line bg-white transition-[width] duration-200 ${collapsed ? "w-12" : "w-[min(32vw,420px)] max-[900px]:w-[min(46vw,350px)] max-md:w-[min(50vw,300px)]"}`}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Tampilkan daftar perangkat"
              aria-label="Tampilkan daftar perangkat"
              className="flex h-full flex-col items-center gap-3 py-4 text-xs text-muted hover:bg-bg"
            >
              <Glyph name="panel-open" />
              <span style={{ writingMode: "vertical-rl" }}>
                Perangkat {devices.length}
              </span>
            </button>
          ) : (
            <>
              <div className="shrink-0 border-b border-line px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[16px] font-semibold text-ink">
                    Perangkat IoT{" "}
                    <span className="ml-1 font-normal text-muted">
                      {loading ? "…" : devices.length}
                    </span>
                  </h2>
                  <button
                    type="button"
                    aria-label="Sembunyikan panel perangkat"
                    title="Sembunyikan panel"
                    onClick={() => setCollapsed(true)}
                    className="grid size-8 place-items-center rounded text-muted hover:bg-bg"
                  >
                    <Glyph name="panel-close" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Daftar titik pemasangan yang diverifikasi Admin
                </p>
                <div
                  role="img"
                  aria-label={`${positioned.length} perangkat memiliki koordinat, ${devices.length - positioned.length} belum memiliki koordinat`}
                  className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-bg"
                >
                  {devices.length > 0 && (
                    <>
                      <span
                        className="bg-brand"
                        style={{
                          width: `${(positioned.length / devices.length) * 100}%`,
                        }}
                      />
                      <span
                        className="bg-[#b59059]"
                        style={{
                          width: `${((devices.length - positioned.length) / devices.length) * 100}%`,
                        }}
                      />
                    </>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  <b className="text-brand">{positioned.length}</b> di peta ·{" "}
                  <b className="text-[#a57a40]">
                    {devices.length - positioned.length}
                  </b>{" "}
                  belum ada titik
                </p>
                <div className="mt-3 flex h-10 items-center gap-2 rounded-md border border-line-strong bg-white px-3 transition-colors focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/10">
                  <Glyph name="search" size={16} />
                  <input
                    aria-label="Cari perangkat atau lokasi"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Cari perangkat atau lokasi…"
                    className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent text-xs text-ink outline-none ring-0 placeholder:text-muted focus:outline-none focus-visible:outline-none"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {loading && (
                  <p className="px-4 py-5 text-sm text-muted">
                    Memuat perangkat…
                  </p>
                )}
                {!loading && shown.length === 0 && (
                  <p className="px-4 py-5 text-sm text-muted">
                    Belum ada perangkat yang cocok.
                  </p>
                )}
                {shown.map((device) => {
                  const placed = hasCoordinates(device);
                  const active = selectedId === device.id;
                  return (
                    <article
                      key={device.id}
                      className={`border-b border-line ${active ? "border-l-[3px] border-l-brand bg-brand-50/50" : "bg-white hover:bg-bg"}`}
                    >
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => focus(device)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                      >
                        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-[#f1f6f3]">
                          <Image
                            src={DEVICE_IMAGE}
                            alt=""
                            width={44}
                            height={44}
                            className="size-11 object-contain"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-ink">
                            {device.label}
                          </span>
                          <span className="mt-0.5 block break-all text-[11px] text-muted">
                            {device.code}
                          </span>
                          <span
                            className={`mt-1.5 block text-xs ${placed ? "text-brand" : "text-[#a57a40]"}`}
                          >
                            {device.locationLabel?.trim() ||
                              (placed
                                ? "Lokasi terverifikasi"
                                : "Lokasi belum dicatat")}
                          </span>
                          {placed ? (
                            <span className="mt-1 block font-mono text-[11px] tabular-nums text-ink">
                              {device.latitude.toFixed(6)},{" "}
                              {device.longitude.toFixed(6)}
                            </span>
                          ) : (
                            <span className="mt-1 block text-[11px] text-muted">
                              Koordinat belum dicatat
                            </span>
                          )}
                          <span className="mt-1 block text-[11px] text-muted">
                            {device.verifiedAt
                              ? `Diverifikasi ${formatWita(device.verifiedAt)}`
                              : "Waktu verifikasi belum tersedia"}
                          </span>
                        </span>
                        <span className="mt-2 shrink-0 text-muted">
                          <Glyph name="chevron" size={15} />
                        </span>
                      </button>
                      {active && (
                        <div className="border-t border-line/70 bg-brand-50/30 px-4 py-3 text-xs">
                          <p className="font-medium text-ink">
                            {placed
                              ? "Titik pemasangan fisik perangkat"
                              : "Titik pemasangan belum ada"}
                          </p>
                          <p className="mt-1 text-muted">
                            Status koneksi: tidak tersedia (bukan indikator
                            online)
                          </p>
                          <p className="mt-1 text-muted">
                            {device.verificationMethod === "field_gps"
                              ? "Metode: GPS lapangan"
                              : device.verificationMethod ===
                                  "manual_map_verified"
                                ? "Metode: diverifikasi melalui peta"
                                : "Metode verifikasi belum tercatat"}
                          </p>
                          <Link
                            href={
                              demo
                                ? "/demo/admin/map"
                                : `/admin/listen-locations?deviceId=${encodeURIComponent(device.id)}`
                            }
                            className="mt-2 inline-block font-semibold text-brand hover:underline"
                          >
                            {placed
                              ? "Perbarui lokasi"
                              : "Atur lokasi perangkat"}
                          </Link>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <footer className="shrink-0 border-t border-line bg-white px-4 py-3 text-[11px] text-muted">
                Koordinat tepat hanya untuk Admin. Titik ini bukan posisi pasti
                sumber suara satwa.
              </footer>
            </>
          )}
        </aside>
        <div className="relative min-w-0 flex-1 bg-[#eaf1ed]">
          <div
            ref={mapContainer}
            role="application"
            aria-label="Peta pemasangan IoT LISTEN"
            className="absolute inset-0"
          />
          <div className="pointer-events-auto absolute left-3 top-3 z-20 flex gap-1 rounded-lg border border-line bg-white/95 p-1 shadow-md">
            <ToolButton
              name={showPins ? "eye" : "eye-off"}
              label={
                showPins
                  ? "Sembunyikan lokasi perangkat"
                  : "Tampilkan lokasi perangkat"
              }
              active={showPins}
              onClick={() => setShowPins((value) => !value)}
            />
            <ToolButton
              name="target"
              label="Fokus semua perangkat"
              onClick={focusAll}
              disabled={!mapReady || positioned.length === 0}
            />
            <ToolButton
              name="refresh"
              label="Muat ulang lokasi"
              onClick={() => setRefreshIndex((v) => v + 1)}
              disabled={loading}
            />
          </div>
          {organizationId && (
            <MapLocationControls
              organizationId={organizationId}
              onNavigate={setNavigation}
            />
          )}
          {!loading && devices.length > 0 && positioned.length === 0 && (
            <p className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[290px] rounded-lg border border-line bg-white/95 p-3 text-xs text-muted shadow-sm">
              Belum ada koordinat pemasangan. Pilih perangkat di daftar untuk
              mengatur lokasinya.
            </p>
          )}
          {mapError && (
            <p
              role="status"
              className="absolute bottom-3 left-3 right-16 z-30 rounded-md bg-white p-3 text-xs text-warn shadow-md"
            >
              {mapError}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
