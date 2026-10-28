/** Safe normalization for public Photon / OpenStreetMap search results. */
export type PlaceResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

const INDONESIA_ENVELOPE = { minLat: -12, maxLat: 8, minLon: 94, maxLon: 142 };

export function validPlaceQuery(input: string): string | null {
  const q = input.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (q.length < 3 || q.length > 75 || !/^[\p{L}\p{N}\s.,'()/-]+$/u.test(q))
    return null;
  return q;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function safeText(value: unknown, maxLength = 110): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/** Fail closed on non-Indonesian, incomplete or out-of-bounds provider output. */
export function parsePhotonPlaces(input: unknown): PlaceResult[] {
  const obj = object(input);
  const features = Array.isArray(obj?.features)
    ? obj.features.slice(0, 12)
    : [];
  const places: PlaceResult[] = [];
  const used = new Set<string>();
  for (const item of features) {
    const feature = object(item);
    const geom = object(feature?.geometry);
    const props = object(feature?.properties);
    const coords = geom?.coordinates;
    if (
      geom?.type !== "Point" ||
      !Array.isArray(coords) ||
      coords.length < 2 ||
      !props
    )
      continue;
    const [lon, lat] = coords;
    if (
      typeof lat !== "number" ||
      typeof lon !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < INDONESIA_ENVELOPE.minLat ||
      lat > INDONESIA_ENVELOPE.maxLat ||
      lon < INDONESIA_ENVELOPE.minLon ||
      lon > INDONESIA_ENVELOPE.maxLon ||
      safeText(props.countrycode).toUpperCase() !== "ID"
    )
      continue;
    const name = safeText(props.name);
    if (!name) continue;
    const parts = [
      name,
      safeText(props.city),
      safeText(props.county),
      safeText(props.state),
    ].filter((v, i, a) => v && a.indexOf(v) === i);
    const label = parts.join(", ").slice(0, 210);
    const marker = `${lat.toFixed(5)}:${lon.toFixed(5)}:${label}`;
    if (used.has(marker)) continue;
    used.add(marker);
    places.push({
      id: `${safeText(props.osm_type, 2)}:${String(props.osm_id ?? places.length).slice(0, 24)}`,
      label,
      latitude: lat,
      longitude: lon,
    });
    if (places.length >= 6) break;
  }
  return places;
}
