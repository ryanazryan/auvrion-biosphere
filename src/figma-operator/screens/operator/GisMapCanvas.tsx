"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ApprovedIotMapPoint,
  MapNavigationTarget,
} from "@/components/gis/map-navigation";
import { isValidIndonesiaCoordinate } from "@/components/gis/map-navigation";
import type { GisRecord } from "@/figma-operator/gis/client";
import { approvedPoint } from "@/figma-operator/gis/client";
import {
  formatIndonesiaTime,
  type IndonesiaTimeZone,
} from "@/figma-operator/gis/format-time";
import type { HotspotPoint } from "@/figma-operator/gis/hotspots";
import {
  installOpenFreeMapPoiFallback,
  isOpenFreeMapLiberty,
} from "@/figma-operator/gis/openfreemap-missing-icons";
import {
  formatBrightness,
  formatConfidence,
  formatFrp,
} from "@/figma-operator/gis/thermal-display";
import type { AirQualitySite } from "@/server/gis/air-quality-contract";

const STYLE_URL = process.env.NEXT_PUBLIC_AUVRION_BASEMAP_STYLE_URL?.trim();
const ATTRIBUTION = process.env.NEXT_PUBLIC_AUVRION_BASEMAP_ATTRIBUTION?.trim();
const HAS_APPROVED_BASEMAP = Boolean(STYLE_URL && ATTRIBUTION);
const NO_IOT_LOCATIONS: readonly ApprovedIotMapPoint[] = [];

/** The Figma schematic is only a LOCAL backdrop. It NEVER hosts real/synthetic observation markers. */
const LOCAL_SCHEMATIC_PREVIEW =
  process.env.NODE_ENV === "development" && !HAS_APPROVED_BASEMAP;

/** No third-party basemap request without both an approved URL and its attribution. */
export function GisMapCanvas({
  rows,
  selected,
  onSelect,
  focusTarget = null,
  hotspots = [],
  hotspotBounds = null,
  airQualitySites = [],
  onPickedLocationChange,
  selectedTimeZone = "Asia/Makassar",
  navigationTarget = null,
  approvedIotLocations = NO_IOT_LOCATIONS,
}: {
  rows: GisRecord[];
  selected: string | null;
  onSelect: (id: string) => void;
  hotspots?: HotspotPoint[];
  airQualitySites?: AirQualitySite[];
  onPickedLocationChange?: (
    point: { latitude: number; longitude: number } | null,
  ) => void;
  hotspotBounds?: [number, number, number, number] | null;
  /** Explicit, approved pan action; never inferred from normal list selection. */
  focusTarget?: { id: string; request: number } | null;
  selectedTimeZone?: IndonesiaTimeZone;
  /** User-initiated viewport navigation; never persisted as an observation. */
  navigationTarget?: MapNavigationTarget | null;
  /** Future-only: server-authorized coordinates with verified disclosure. */
  approvedIotLocations?: readonly ApprovedIotMapPoint[];
}) {
  const containerRef = useRef<HTMLElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const timeZoneRef = useRef(selectedTimeZone);
  timeZoneRef.current = selectedTimeZone;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onPickedLocationChangeRef = useRef(onPickedLocationChange);
  onPickedLocationChangeRef.current = onPickedLocationChange;
  const markerButtons = useRef(new Map<string, HTMLButtonElement>());
  const [hotspotLayerReady, setHotspotLayerReady] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [legendOpen, setLegendOpen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [pinPicking, setPinPicking] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<{
    longitude: number;
    latitude: number;
  } | null>(null);
  const pinPickingRef = useRef(pinPicking);
  pinPickingRef.current = pinPicking;
  const pickedLocationRef = useRef(pickedLocation);
  pickedLocationRef.current = pickedLocation;
  const pickedMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const navigationMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const iotMarkersRef = useRef<import("maplibre-gl").Marker[]>([]);

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
    setHotspotLayerReady(false);
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
        if (disposed || !containerRef.current) return;

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
        // OpenFreeMap Liberty's upstream sprite lacks some POI icons. Supply
        // visible neutral fallback markers, never silent transparent pixels.
        // Does not affect third-party styles, observation pins, NASA or AQI layers.
        if (!schematic && isOpenFreeMapLiberty(STYLE_URL)) {
          installOpenFreeMapPoiFallback(map);
        }
        map.on("click", (event) => {
          const activeMap = map;
          if (
            !activeMap ||
            disposed ||
            !pinPickingRef.current ||
            !HAS_APPROVED_BASEMAP
          )
            return;
          // Clicking NASA features should keep their original inspect/zoom behavior.
          const satelliteLayers = [
            "auvrion-hotspot-points",
            "auvrion-hotspot-clusters",
          ].filter((id) => Boolean(activeMap.getLayer(id)));
          if (
            satelliteLayers.length > 0 &&
            activeMap.queryRenderedFeatures(event.point, {
              layers: satelliteLayers,
            }).length > 0
          )
            return;
          const { lng, lat } = event.lngLat;
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
          pickedMarkerRef.current?.remove();
          pickedMarkerRef.current = new lib.Marker({ color: "#20785f" })
            .setLngLat([lng, lat])
            .addTo(activeMap);
          setPickedLocation({ longitude: lng, latitude: lat });
          onPickedLocationChangeRef.current?.({
            longitude: lng,
            latitude: lat,
          });
          setPinPicking(false);
        });
        map.on("rotate", () => {
          if (!disposed && map) setBearing(map.getBearing());
        });

        map.once("load", () => {
          if (disposed || !map) return;
          const activeMap = map;
          setMapLoaded(true);
          setBearing(activeMap.getBearing());
          const lastPin = pickedLocationRef.current;
          if (!schematic && lastPin) {
            pickedMarkerRef.current = new lib.Marker({ color: "#20785f" })
              .setLngLat([lastPin.longitude, lastPin.latitude])
              .addTo(activeMap);
          }
          if (!schematic) {
            activeMap.addSource("auvrion-model-air-quality", {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            });
            activeMap.addLayer({
              id: "auvrion-model-aqi-circles",
              type: "circle",
              source: "auvrion-model-air-quality",
              paint: {
                "circle-radius": 16,
                "circle-color": [
                  "case",
                  ["<", ["get", "aqi"], 0],
                  "#64748b",
                  [
                    "step",
                    ["get", "aqi"],
                    "#27965f",
                    51,
                    "#c49620",
                    101,
                    "#d66a27",
                    151,
                    "#bc3636",
                    201,
                    "#893875",
                  ],
                ],
                "circle-opacity": 0.92,
                "circle-stroke-color": "#fff",
                "circle-stroke-width": 2,
              },
            });
            activeMap.addLayer({
              id: "auvrion-model-aqi-numbers",
              type: "symbol",
              source: "auvrion-model-air-quality",
              layout: {
                "text-font": ["Noto Sans Regular"],
                "text-field": ["get", "aqiLabel"],
                "text-size": 11,
                "text-allow-overlap": true,
              },
              paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#1c2931",
                "text-halo-width": 0.4,
              },
            });
            activeMap.on("click", "auvrion-model-aqi-circles", (event) => {
              const feature = event.features?.[0];
              if (feature?.geometry.type !== "Point") return;
              const coord = feature.geometry.coordinates;
              if (coord.length < 2) return;
              const props = feature.properties ?? {};
              const panel = document.createElement("div");
              panel.className = "space-y-1 text-xs";
              const heading = document.createElement("strong");
              heading.textContent = `${String(props.name ?? "Lokasi")} · ${Number(props.aqi) < 0 ? "US AQI tidak tersedia" : `US AQI ${String(props.aqiLabel ?? "—")}`}`;
              const particles = document.createElement("p");
              particles.textContent = `PM2.5 ${String(props.pm25 ?? "—")} · PM10 ${String(props.pm10 ?? "—")} µg/m³`;
              const stamp = document.createElement("p");
              stamp.textContent = `Pembaruan: ${formatIndonesiaTime(
                String(props.modelTimeUtc ?? ""),
                timeZoneRef.current,
              )}`;
              stamp.className = "text-[#64766c]";
              panel.append(heading, particles, stamp);
              new lib.Popup({ maxWidth: "280px", closeButton: true })
                .setLngLat([Number(coord[0]), Number(coord[1])])
                .setDOMContent(panel)
                .addTo(activeMap);
            });
            activeMap.addSource("auvrion-nasa-hotspots", {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
              cluster: true,
              clusterRadius: 42,
              clusterMaxZoom: 10,
              // Use peak observed FRP for visual display, NOT a verified fire rating.
              clusterProperties: {
                maxFrpMw: ["max", ["coalesce", ["get", "frpMw"], -1]],
              },
            });
            activeMap.addLayer({
              id: "auvrion-hotspot-clusters",
              type: "circle",
              source: "auvrion-nasa-hotspots",
              filter: ["has", "point_count"],
              paint: {
                "circle-radius": 14,
                "circle-color": [
                  "case",
                  ["==", ["get", "maxFrpMw"], -1],
                  "#64748b",
                  [">=", ["get", "maxFrpMw"], 20],
                  "#dc2626",
                  [">=", ["get", "maxFrpMw"], 5],
                  "#f59e0b",
                  "#eab308",
                ],
                "circle-opacity": 0.8,
                "circle-stroke-color": "#fff",
                "circle-stroke-width": 1.5,
              },
            });
            activeMap.addLayer({
              id: "auvrion-hotspot-counts",
              type: "symbol",
              source: "auvrion-nasa-hotspots",
              filter: ["has", "point_count"],
              layout: {
                "text-font": ["Noto Sans Regular"],
                "text-field": ["get", "point_count_abbreviated"],
                "text-size": 11,
              },
              paint: { "text-color": "#fff" },
            });
            activeMap.addLayer({
              id: "auvrion-hotspot-points",
              type: "circle",
              source: "auvrion-nasa-hotspots",
              filter: ["!", ["has", "point_count"]],
              paint: {
                "circle-radius": 5.5,
                "circle-color": [
                  "case",
                  ["==", ["get", "frpMw"], null],
                  "#64748b",
                  [">=", ["get", "frpMw"], 20],
                  "#dc2626",
                  [">=", ["get", "frpMw"], 5],
                  "#f59e0b",
                  "#eab308",
                ],
                "circle-opacity": 0.78,
                "circle-stroke-color": "#fff",
                "circle-stroke-width": 1.1,
              },
            });
            activeMap.on("click", "auvrion-hotspot-points", (event) => {
              const feature = event.features?.[0];
              if (feature?.geometry.type !== "Point") return;
              const [longitude, latitude] = feature.geometry.coordinates;
              if (!Number.isFinite(longitude) || !Number.isFinite(latitude))
                return;
              const p = feature.properties ?? {};
              const content = document.createElement("div");
              content.className = "space-y-1 text-xs leading-5 text-[#23352d]";
              const heading = document.createElement("strong");
              heading.className = "block text-sm";
              heading.textContent = "Anomali termal · NASA FIRMS";
              content.append(heading);
              const addLine = (label: string, value: string) => {
                const line = document.createElement("p");
                line.textContent = `${label}: ${value}`;
                content.append(line);
              };
              addLine("FRP", formatFrp(p.frpMw));
              addLine("Kecerahan I4", formatBrightness(p.brightnessTi4K));
              addLine("Confidence", formatConfidence(p.confidence));
              addLine(
                "Akuisisi",
                formatIndonesiaTime(
                  String(p.acquiredAtUtc ?? ""),
                  timeZoneRef.current,
                ),
              );
              addLine(
                "Sensor",
                `${String(p.satellite ?? "—")} · ${String(p.instrument ?? "VIIRS")}`,
              );
              addLine(
                "Koordinat indikatif",
                `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
              );
              const caution = document.createElement("p");
              caution.className =
                "border-t border-[#dbe4df] pt-1 text-[#64766c]";
              caution.textContent =
                "Status lapangan: belum diverifikasi. Kecerahan I4 bukan suhu udara.";
              content.append(caution);
              new lib.Popup({ maxWidth: "320px", closeButton: true })
                .setLngLat([longitude, latitude])
                .setDOMContent(content)
                .addTo(activeMap);
            });
            activeMap.on("click", "auvrion-hotspot-clusters", (event) => {
              const feature = event.features?.[0];
              if (feature?.geometry.type !== "Point") return;
              const coords = feature.geometry.coordinates;
              activeMap.easeTo({
                center: [Number(coords[0]), Number(coords[1])],
                zoom: Math.min(14, activeMap.getZoom() + 2),
                duration: 350,
              });
            });
            setHotspotLayerReady(true);
          }
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
      pickedMarkerRef.current?.remove();
      pickedMarkerRef.current = null;
      navigationMarkerRef.current?.remove();
      navigationMarkerRef.current = null;
      for (const marker of iotMarkersRef.current) marker.remove();
      iotMarkersRef.current = [];
      buttons.clear();
      mapRef.current = null;
      map?.remove();
    };
  }, [points, retryKey]);

  // AB-WC-011-PIN-AQI-UX-20261028
  // Explicit search/GPS navigation. Read GPS only after user permission and click.
  useEffect(() => {
    const map = mapRef.current;
    // Clear is distinct from closing the search panel.
    navigationMarkerRef.current?.remove();
    navigationMarkerRef.current = null;
    if (!mapLoaded || !HAS_APPROVED_BASEMAP || !navigationTarget) return;
    if (
      !map ||
      !isValidIndonesiaCoordinate(
        navigationTarget.latitude,
        navigationTarget.longitude,
      )
    )
      return;
    let cancelled = false;
    void import("maplibre-gl")
      .then((lib) => {
        if (cancelled || mapRef.current !== map) return;
        navigationMarkerRef.current?.remove();
        navigationMarkerRef.current = new lib.Marker({
          color: navigationTarget.kind === "device" ? "#2563eb" : "#20785f",
        })
          .setLngLat([navigationTarget.longitude, navigationTarget.latitude])
          .setPopup(
            new lib.Popup({ offset: 22 }).setText(
              navigationTarget.label.slice(0, 210),
            ),
          )
          .addTo(map);
        map.flyTo({
          center: [navigationTarget.longitude, navigationTarget.latitude],
          zoom: Math.max(10, map.getZoom()),
          duration: 550,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [navigationTarget, mapLoaded]);

  // Only trusted backend data may populate these future IoT locations.
  // A registered device is NOT automatically online or geolocated.
  useEffect(() => {
    for (const marker of iotMarkersRef.current) marker.remove();
    iotMarkersRef.current = [];
    if (!mapLoaded || !HAS_APPROVED_BASEMAP) return;
    const map = mapRef.current;
    if (!map) return;
    const approved = approvedIotLocations.filter(
      (point) =>
        point.verifiedLocation === true &&
        point.disclosureApproved === true &&
        isValidIndonesiaCoordinate(point.latitude, point.longitude) &&
        Number.isFinite(Date.parse(point.observedAtUtc)) &&
        typeof point.label === "string",
    );
    let cancelled = false;
    void import("maplibre-gl")
      .then((lib) => {
        if (cancelled || mapRef.current !== map) return;
        iotMarkersRef.current = approved.slice(0, 200).map((point) =>
          new lib.Marker({ color: "#7c3aed" })
            .setLngLat([point.longitude, point.latitude])
            .setPopup(
              new lib.Popup({ offset: 20 }).setText(
                `${point.label.slice(0, 100)} · Lokasi tercatat: ${point.observedAtUtc}. Status online tidak diketahui.`,
              ),
            )
            .addTo(map),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      for (const marker of iotMarkersRef.current) marker.remove();
      iotMarkersRef.current = [];
    };
  }, [approvedIotLocations, mapLoaded]);

  // Repaint model AQI without resetting current map viewport or private observation markers.
  useEffect(() => {
    if (!hotspotLayerReady || !HAS_APPROVED_BASEMAP) return;
    const source = mapRef.current?.getSource("auvrion-model-air-quality") as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    const features = airQualitySites
      .filter((site) => site.usAqi !== null)
      .map((site) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [site.longitude, site.latitude] as [number, number],
        },
        properties: {
          name: site.name,
          aqi: site.usAqi ?? -1,
          aqiLabel: site.usAqi === null ? "PM" : String(site.usAqi),
          pm25: site.pm25 === null ? "—" : String(site.pm25),
          pm10: site.pm10 === null ? "—" : String(site.pm10),
          modelTimeUtc: site.modelTimeUtc ?? "tidak tersedia",
        },
      }));
    source?.setData({ type: "FeatureCollection", features });
  }, [airQualitySites, hotspotLayerReady]);

  // Refresh the MapLibre satellite source after the style and its layers exist.
  // Keep satellite visibility independent from the AQI DOM markers.
  useEffect(() => {
    if (!hotspotLayerReady || !HAS_APPROVED_BASEMAP) return;
    const map = mapRef.current;
    const source = map?.getSource("auvrion-nasa-hotspots") as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    if (!map || !source) {
      console.error("AUVRION_HOTSPOTS_SOURCE_MISSING");
      return;
    }
    const layerIds = [
      "auvrion-hotspot-clusters",
      "auvrion-hotspot-counts",
      "auvrion-hotspot-points",
    ];
    try {
      // A prior style operation must never leave the satellite layer hidden.
      for (const id of layerIds) {
        if (map.getLayer(id))
          map.setLayoutProperty(id, "visibility", "visible");
      }
      const update = source.setData({
        type: "FeatureCollection",
        features: hotspots,
      });
      void Promise.resolve(update).catch(() => {
        console.error("AUVRION_HOTSPOTS_GEOJSON_UPDATE_FAILED");
      });
    } catch {
      console.error("AUVRION_HOTSPOTS_GEOJSON_UPDATE_FAILED");
    }
  }, [hotspots, hotspotLayerReady]);

  useEffect(() => {
    if (!hotspotLayerReady || !HAS_APPROVED_BASEMAP || !hotspotBounds) return;
    mapRef.current?.fitBounds(
      [
        [hotspotBounds[0], hotspotBounds[1]],
        [hotspotBounds[2], hotspotBounds[3]],
      ],
      { padding: 50, duration: 500, maxZoom: 9 },
    );
  }, [hotspotBounds, hotspotLayerReady]);

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
    <div className="absolute inset-0 overflow-hidden bg-[#eef1ec]">
      {ready && !error && (
        <section
          className="absolute inset-0"
          style={{ position: "absolute", inset: 0 }}
          ref={containerRef}
          aria-label="Peta observasi"
        />
      )}

      {HAS_APPROVED_BASEMAP && mapLoaded && !error && (
        <div className="absolute bottom-4 right-3 z-20 flex max-w-[min(260px,calc(100%-1.5rem))] flex-col items-end gap-2 max-md:bottom-22">
          {pickedLocation && (
            <div className="rounded-lg border border-line bg-white/95 px-3 py-2 text-xs text-ink shadow-sm backdrop-blur-sm">
              <div className="font-medium">
                Pin · {pickedLocation.latitude.toFixed(5)},{" "}
                {pickedLocation.longitude.toFixed(5)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                Data lokasi belum dimuat
              </div>
              <button
                type="button"
                className="mt-1 text-xs text-brand hover:underline"
                onClick={() => {
                  pickedMarkerRef.current?.remove();
                  pickedMarkerRef.current = null;
                  setPickedLocation(null);
                  onPickedLocationChangeRef.current?.(null);
                }}
              >
                Hapus pin
              </button>
            </div>
          )}
          <button
            type="button"
            aria-pressed={pinPicking}
            onClick={() => setPinPicking((value) => !value)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {pinPicking ? "Batalkan pilih titik" : "Pilih titik lokasi"}
          </button>
        </div>
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
              <p className="mt-2 text-[11px] font-semibold text-ink">
                FRP satelit (MW) · skala visual
              </p>
              <p className="mt-1">
                <span className="mr-2 inline-block size-2 rounded-full bg-[#eab308]" />
                0–&lt;5 MW
              </p>
              <p className="mt-1">
                <span className="mr-2 inline-block size-2 rounded-full bg-[#f59e0b]" />
                5–&lt;20 MW
              </p>
              <p className="mt-1">
                <span className="mr-2 inline-block size-2 rounded-full bg-[#dc2626]" />
                ≥20 MW
              </p>
              <p className="mt-1">
                <span className="mr-2 inline-block size-2 rounded-full bg-[#64748b]" />
                FRP tidak tersedia
              </p>
              <p className="mt-1 text-[10px]">
                Warna bukan verifikasi kebakaran.
              </p>
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
