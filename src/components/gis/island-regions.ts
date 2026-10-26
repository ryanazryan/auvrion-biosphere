import type { HotspotPoint } from "@/figma-operator/gis/hotspots";

/** Rectangular viewing extents, not administrative or coastline boundaries. */
export const ISLAND_REGIONS = {
  indonesia: { label: "Seluruh Indonesia", bbox: [94, -12, 142, 7.8] },
  sumatra: { label: "Sumatra", bbox: [94, -6.8, 107.5, 6.8] },
  jawa: { label: "Jawa", bbox: [105, -9.3, 115.2, -5.3] },
  kalimantan: { label: "Kalimantan", bbox: [108, -5, 120, 8] },
  sulawesi: { label: "Sulawesi", bbox: [118, -6.5, 126, 3] },
  bali_nusatenggara: {
    label: "Bali & Nusa Tenggara",
    bbox: [114, -12, 126.5, -7.5],
  },
  maluku: { label: "Maluku", bbox: [124, -9, 135, 3.5] },
  papua: { label: "Papua", bbox: [129, -10.8, 142, 1.2] },
} as const;

export type IslandRegion = keyof typeof ISLAND_REGIONS;
export type MapBounds = [number, number, number, number];

export const ISLAND_OPTIONS: {
  value: IslandRegion;
  label: string;
  description: string;
}[] = Object.entries(ISLAND_REGIONS).map(([value, region]) => ({
  value: value as IslandRegion,
  label: region.label,
  description:
    value === "indonesia"
      ? "Tampilkan cakupan negara"
      : "Cakupan peta perkiraan",
}));

export function islandBounds(region: IslandRegion): MapBounds {
  return [...ISLAND_REGIONS[region].bbox] as MapBounds;
}

/** Bounded client-side presentation only. Does NOT prove a detection lies inside island coastline. */
export function islandHotspots(
  points: HotspotPoint[],
  region: IslandRegion,
): HotspotPoint[] {
  if (region === "indonesia") return points;
  const [west, south, east, north] = ISLAND_REGIONS[region].bbox;
  return points.filter((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    return (
      Number.isFinite(lon) &&
      Number.isFinite(lat) &&
      lon >= west &&
      lon <= east &&
      lat >= south &&
      lat <= north
    );
  });
}
