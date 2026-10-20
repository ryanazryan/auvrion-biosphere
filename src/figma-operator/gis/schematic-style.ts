"use client";

/*
 * Isolated copy of Figma Make v7's synthetic base CARTOGRAPHY only.
 * No sample observation coordinates, fake organizations or mock API results.
 * Dev preview ONLY. Do not mix real observation markers with a fictional map.
 */
import type { StyleSpecification } from "maplibre-gl";

type LngLat = [number, number];
type Bounds = [LngLat, LngLat];
const FRAME: Bounds = [
  [-0.2, -0.14],
  [0.18, 0.13],
];
type Basemap = {
  kind: "synthetic";
  style: StyleSpecification;
  attribution: string;
  frame: Bounds;
};
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Deterministic organic closed ring around (cx, cy). */
function blob(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  amp = 0.2,
  n = 72,
): LngLat[] {
  const ring: LngLat[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k =
      1 +
      amp *
        (0.55 * Math.sin(3 * t + seed) +
          0.3 * Math.sin(5 * t + seed * 1.7) +
          0.15 * Math.sin(8 * t + seed * 2.3));
    ring.push([r5(cx + Math.cos(t) * rx * k), r5(cy + Math.sin(t) * ry * k)]);
  }
  ring.push(ring[0]);
  return ring;
}

/* ---------- Schematic basemap (local, deterministic, no tiles) ---------- */
type Geom =
  | { type: "Polygon"; coordinates: LngLat[][] }
  | { type: "LineString"; coordinates: LngLat[] };
const fc = (geoms: Geom[]) => ({
  type: "geojson" as const,
  data: {
    type: "FeatureCollection" as const,
    features: geoms.map((geometry) => ({
      type: "Feature" as const,
      properties: {},
      geometry,
    })),
  },
});
const poly = (ring: LngLat[]): Geom => ({
  type: "Polygon",
  coordinates: [ring],
});
const path = (n: number, f: (t: number) => LngLat): Geom => ({
  type: "LineString",
  coordinates: Array.from({ length: n + 1 }, (_, i) => f(i / n)).map(
    ([x, y]) => [r5(x), r5(y)] as LngLat,
  ),
});

function contours(cx: number, cy: number, seed: number, rings: number): Geom[] {
  return Array.from({ length: rings }, (_, i) =>
    poly(
      blob(
        cx + i * 0.0012,
        cy - i * 0.0008,
        0.009 * (i + 1),
        0.0068 * (i + 1),
        seed + i * 0.35,
        0.12 + i * 0.015,
        96,
      ),
    ),
  );
}

export function syntheticBasemap(): Extract<Basemap, { kind: "synthetic" }> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const river = path(140, (t) => {
    const x = -0.22 + t * 0.42;
    return [
      x,
      -0.028 +
        0.017 * Math.sin(x * 26 + 0.6) +
        0.006 * Math.sin(x * 71 + 1.3) -
        0.05 * x,
    ];
  });
  const creek = path(70, (t) => {
    const y = 0.14 - t * 0.155;
    return [
      0.043 + 0.011 * Math.sin(y * 38 + 0.4) + 0.004 * Math.sin(y * 97),
      y,
    ];
  });
  const style: StyleSpecification = {
    version: 8,
    name: "auvrion-schematic-preview",
    sources: {
      forest: fc([
        poly(blob(-0.03, 0.05, 0.13, 0.07, 0.7, 0.28)),
        poly(blob(0.095, 0.0, 0.075, 0.1, 1.9, 0.26)),
        poly(blob(-0.135, -0.03, 0.06, 0.08, 2.8, 0.25)),
        poly(blob(0.0, -0.088, 0.1, 0.04, 3.6, 0.24)),
      ]),
      dense: fc([
        poly(blob(-0.055, 0.066, 0.05, 0.026, 5.1, 0.22)),
        poly(blob(0.104, 0.024, 0.032, 0.048, 6.2, 0.22)),
        poly(blob(-0.14, -0.04, 0.025, 0.035, 7.3, 0.2)),
      ]),
      contour: fc([
        ...contours(-0.064, 0.072, 0.3, 6),
        ...contours(0.112, 0.034, 1.4, 5),
        ...contours(-0.15, -0.05, 2.2, 4),
      ]),
      lake: fc([poly(blob(0.026, -0.036, 0.014, 0.0085, 8.1, 0.18))]),
      river: fc([river, creek]),
    },
    layers: [
      {
        id: "paper",
        type: "background",
        paint: { "background-color": v("--map-paper") },
      },
      {
        id: "forest",
        type: "fill",
        source: "forest",
        paint: { "fill-color": v("--map-forest"), "fill-antialias": true },
      },
      {
        id: "forest-dense",
        type: "fill",
        source: "dense",
        paint: { "fill-color": v("--map-forest-dense") },
      },
      {
        id: "contour",
        type: "line",
        source: "contour",
        paint: {
          "line-color": v("--map-contour"),
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 14, 1.1],
          "line-opacity": 0.9,
        },
      },
      {
        id: "lake",
        type: "fill",
        source: "lake",
        paint: {
          "fill-color": v("--map-water"),
          "fill-outline-color": v("--map-water-line"),
        },
      },
      {
        id: "river",
        type: "line",
        source: "river",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": v("--map-water-line"),
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 14, 3.2],
        },
      },
    ],
  };
  return {
    kind: "synthetic",
    style,
    attribution:
      "Peta dasar skematis sintetis · tidak menggambarkan lokasi nyata",
    frame: FRAME,
  };
}
