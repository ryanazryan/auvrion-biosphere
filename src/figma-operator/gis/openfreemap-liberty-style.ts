/**
 * OpenFreeMap Liberty style: guard nullable tile properties in the four
 * currently affected numeric filters. Do not silence browser warnings.
 *
 * Keep the upstream attribution, sprite, glyph and source links intact.
 * Other basemap providers are passed through unchanged.
 */
import type { StyleSpecification } from "maplibre-gl";

const LIBERTY_PATH = /^\/styles\/liberty\/?$/;
const MAX_REF_LENGTH = 6;
const ABSENT_REF_LENGTH = 999;
const ABSENT_ADMIN_LEVEL = -1;

type UnknownLayer = { id?: unknown; filter?: unknown };
type StyleDocument = {
  version?: unknown;
  layers?: UnknownLayer[];
  sprite?: unknown;
  glyphs?: unknown;
  sources?: Record<
    string,
    {
      url?: string;
      tiles?: string[];
    }
  >;
};

function isGet(value: unknown, key: string): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value[0] === "get" &&
    value[1] === key
  );
}

function guardComparison(
  filter: unknown,
  key: string,
  operator: ">=" | "<=",
  limit: number,
  fallback: number,
): boolean {
  if (!Array.isArray(filter) || filter[0] !== "all") return false;
  for (const clause of filter.slice(1)) {
    if (!Array.isArray(clause) || clause.length !== 3) continue;
    if (
      clause[0] !== operator ||
      !isGet(clause[1], key) ||
      clause[2] !== limit
    ) {
      continue;
    }
    clause[1] = ["number", ["get", key], fallback];
    return true;
  }
  return false;
}

function absolutize(
  value: string | undefined,
  base: string,
): string | undefined {
  return value ? new URL(value, base).toString() : value;
}

/** Only processes the recognized OpenFreeMap Liberty style URL. */
export async function loadAuvrionBasemapStyle(
  styleUrl: string,
): Promise<string | StyleSpecification> {
  const url = new URL(styleUrl);
  if (
    url.origin !== "https://tiles.openfreemap.org" ||
    !LIBERTY_PATH.test(url.pathname)
  ) {
    return styleUrl;
  }

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error("OPENFREEMAP_STYLE_FETCH_FAILED");
  const document: unknown = await response.json();
  if (!document || typeof document !== "object") {
    throw new Error("OPENFREEMAP_STYLE_INVALID");
  }
  const style = document as StyleDocument;
  if (style.version !== 8 || !Array.isArray(style.layers)) {
    throw new Error("OPENFREEMAP_STYLE_INVALID");
  }

  // Missing values should not participate in numeric comparisons. A missing
  // ref_length should fail the <= 6 check; a missing admin_level should fail
  // the >= 3 check. Preserve every other filter clause verbatim.
  const refLayerIds = new Set([
    "highway-shield-us-interstate",
    "highway-shield-non-us",
    "road_shield_us",
  ]);
  for (const layer of style.layers) {
    if (typeof layer.id !== "string") continue;
    if (refLayerIds.has(layer.id)) {
      guardComparison(
        layer.filter,
        "ref_length",
        "<=",
        MAX_REF_LENGTH,
        ABSENT_REF_LENGTH,
      );
    } else if (layer.id === "boundary_3") {
      guardComparison(layer.filter, "admin_level", ">=", 3, ABSENT_ADMIN_LEVEL);
      guardComparison(layer.filter, "admin_level", "<=", 6, ABSENT_ADMIN_LEVEL);
    }
  }
  // Upstream may have fixed some layers already; leave other clauses intact.

  // Loading a JSON object instead of a style URL changes relative URL
  // resolution. Make only asset links absolute, preserving the same origin.
  if (typeof style.sprite === "string")
    style.sprite = absolutize(style.sprite, url.toString());
  if (typeof style.glyphs === "string")
    style.glyphs = absolutize(style.glyphs, url.toString());
  if (style.sources && typeof style.sources === "object") {
    for (const source of Object.values(style.sources)) {
      if (!source || typeof source !== "object") continue;
      if (typeof source.url === "string")
        source.url = absolutize(source.url, url.toString());
      if (Array.isArray(source.tiles)) {
        source.tiles = source.tiles.map(
          (tile) => absolutize(tile, url.toString()) ?? tile,
        );
      }
    }
  }
  return style as unknown as StyleSpecification;
}
