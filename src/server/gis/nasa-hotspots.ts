import "server-only";

/** Regional bounding rectangles, NOT legal province/island boundaries. */
export const WEBGIS_REGIONS = {
  // Nationwide FIRMS country endpoint filters by Indonesian territory.
  // The broad bbox here validates coordinates; it does not define national borders.
  indonesia: { label: "Indonesia", bbox: [94, -11.5, 142, 7.5] },
  sumatra: { label: "Sumatra", bbox: [94, -6.8, 107.5, 6.8] },
  jawa: { label: "Jawa", bbox: [105, -9.3, 115.2, -5.3] },
  kalimantan: { label: "Kalimantan", bbox: [108, -5, 120, 8] },
  sulawesi: { label: "Sulawesi", bbox: [118, -6.5, 126, 3] },
  bali: { label: "Bali", bbox: [114.3, -8.95, 115.8, -8] },
  bali_nusatenggara: {
    label: "Bali & Nusa Tenggara",
    bbox: [114, -12, 126.5, -7.5],
  },
  maluku: { label: "Maluku", bbox: [124, -9, 135, 3.5] },
  papua: { label: "Papua", bbox: [129, -10.8, 142, 1.2] },
} as const;
export type WebgisRegion = keyof typeof WEBGIS_REGIONS;
export type WebgisDays = 1 | 2 | 5;
export const WEBGIS_WINDOWS: readonly WebgisDays[] = [1, 2, 5];
const NASA_SOURCE = "VIIRS_NOAA20_NRT";
const DATASET_URL = "https://firms.modaps.eosdis.nasa.gov/api/area";
const CACHE_MS = 15 * 60_000;
const MAX_CSV_BYTES = 16_000_000;
const MAX_FEATURES = 25_000;

export type HotspotFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: string;
    acquiredAtUtc: string;
    confidence: string;
    frpMw: number | null;
    brightnessTi4K: number | null;
    brightnessTi5K: number | null;
    satellite: string;
    instrument: string;
  };
};
export type HotspotResponse = {
  regionId: WebgisRegion;
  regionLabel: string;
  bbox: [number, number, number, number];
  days: WebgisDays;
  source: "NASA FIRMS";
  sensor: typeof NASA_SOURCE;
  retrievedAtUtc: string;
  count: number;
  invalidRows: number;
  truncated: boolean;
  features: HotspotFeature[];
  limitations: string[];
};

function csvLine(line: string): string[] {
  const values: string[] = [];
  let item = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        item += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      values.push(item.trim());
      item = "";
    } else item += ch;
  }
  values.push(item.trim());
  return values;
}

/** Parses only declared NASA FIRMS fields, rejecting invalid/geographically inconsistent points. */
/** VIIRS channel brightness (Kelvin), not ambient air or surface fire temperature. */
function brightnessKelvin(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 150 && value <= 500 ? value : null;
}

export function parseNasaCsv(
  csv: string,
  bbox: readonly [number, number, number, number],
): { features: HotspotFeature[]; invalidRows: number; truncated: boolean } {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  if (!csv.trim()) return { features: [], invalidRows: 0, truncated: false };
  const headers = csvLine(lines.shift() ?? "");
  const idx = (key: string) => headers.indexOf(key);
  for (const key of [
    "latitude",
    "longitude",
    "acq_date",
    "acq_time",
    "confidence",
    "satellite",
    "instrument",
    "frp",
  ]) {
    if (idx(key) < 0) throw new Error("NASA_SCHEMA_UNAVAILABLE");
  }
  const features: HotspotFeature[] = [];
  let invalidRows = 0;
  let truncated = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    const values = csvLine(line);
    const lat = Number(values[idx("latitude")]);
    const lon = Number(values[idx("longitude")]);
    const date = values[idx("acq_date")] ?? "";
    const time = values[idx("acq_time")] ?? "";
    const frpRaw = values[idx("frp")] ?? "";
    const frp = frpRaw ? Number(frpRaw) : null;
    const brightnessTi4K = brightnessKelvin(
      idx("bright_ti4") < 0 ? undefined : values[idx("bright_ti4")],
    );
    const brightnessTi5K = brightnessKelvin(
      idx("bright_ti5") < 0 ? undefined : values[idx("bright_ti5")],
    );
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < bbox[1] ||
      lat > bbox[3] ||
      lon < bbox[0] ||
      lon > bbox[2] ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^\d{1,4}$/.test(time) ||
      (frp !== null && (!Number.isFinite(frp) || frp < 0))
    ) {
      invalidRows++;
      continue;
    }
    const hhmm = time.padStart(4, "0");
    const stamp = `${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`;
    if (
      Number.isNaN(Date.parse(stamp)) ||
      Number(hhmm.slice(0, 2)) > 23 ||
      Number(hhmm.slice(2)) > 59
    ) {
      invalidRows++;
      continue;
    }
    if (features.length >= MAX_FEATURES) {
      truncated = true;
      break;
    }
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        id: `${date}-${hhmm}-${features.length}`,
        acquiredAtUtc: stamp,
        confidence: (values[idx("confidence")] ?? "unknown").slice(0, 16),
        frpMw: frp,
        brightnessTi4K,
        brightnessTi5K,
        satellite: (values[idx("satellite")] ?? "unknown").slice(0, 20),
        instrument: (values[idx("instrument")] ?? "unknown").slice(0, 20),
      },
    });
  }
  return { features, invalidRows, truncated };
}

const cache = new Map<string, { until: number; response: HotspotResponse }>();
const pending = new Map<string, Promise<HotspotResponse>>();

async function readCappedResponse(response: Response): Promise<string> {
  if (!response.ok) throw new Error("NASA_UPSTREAM_UNAVAILABLE");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_CSV_BYTES) throw new Error("NASA_RESPONSE_TOO_LARGE");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("NASA_EMPTY_RESPONSE");
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_CSV_BYTES) {
        await reader.cancel();
        throw new Error("NASA_RESPONSE_TOO_LARGE");
      }
      parts.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(combined);
}

export function isWebgisRegion(value: string): value is WebgisRegion {
  return Object.hasOwn(WEBGIS_REGIONS, value);
}
export function isWebgisDays(value: number): value is WebgisDays {
  return WEBGIS_WINDOWS.includes(value as WebgisDays);
}

export async function getNasaHotspots(
  regionId: WebgisRegion,
  days: WebgisDays,
): Promise<HotspotResponse> {
  const key = process.env.AUVRION_FIRMS_MAP_KEY;
  if (!key || !/^[a-zA-Z0-9]{16,64}$/.test(key))
    throw new Error("NASA_KEY_NOT_CONFIGURED");
  const slot = `${regionId}:${days}`;
  const now = Date.now();
  const cached = cache.get(slot);
  if (cached && cached.until > now) return cached.response;
  const inFlight = pending.get(slot);
  if (inFlight) return inFlight;
  const promise = (async () => {
    const region = WEBGIS_REGIONS[regionId];
    const bbox = region.bbox as readonly [number, number, number, number];
    const url = `${DATASET_URL}/csv/${key}/${NASA_SOURCE}/${bbox.join(",")}/${days}`;
    // Credential stays server-side; never return the credential-bearing URL or log it.
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(
        regionId === "indonesia" ? 25_000 : days === 5 ? 20_000 : 12_000,
      ),
      cache: "no-store",
    });
    const parsed = parseNasaCsv(await readCappedResponse(upstream), bbox);
    const result: HotspotResponse = {
      regionId,
      regionLabel: region.label,
      bbox: [...bbox] as [number, number, number, number],
      days,
      source: "NASA FIRMS",
      sensor: NASA_SOURCE,
      retrievedAtUtc: new Date().toISOString(),
      count: parsed.features.length,
      invalidRows: parsed.invalidRows,
      truncated: parsed.truncated,
      features: parsed.features,
      limitations: [
        regionId === "indonesia"
          ? "Cakupan berupa bounding box kawasan Indonesia, dapat mencakup negara tetangga, dan bukan batas administrasi resmi."
          : "Batas wilayah berbentuk bounding box perkiraan, bukan batas administrasi resmi.",
        "Titik adalah anomali termal satelit, bukan konfirmasi kebakaran.",
        ...(parsed.truncated
          ? [
              "Hasil dipotong pada 25.000 titik; jumlah tidak mewakili total wilayah.",
            ]
          : []),
        ...(parsed.invalidRows > 0
          ? ["Sebagian baris upstream tidak lolos validasi."]
          : []),
      ],
    };
    if (cache.size > 20) cache.clear();
    cache.set(slot, { until: Date.now() + CACHE_MS, response: result });
    return result;
  })();
  pending.set(slot, promise);
  try {
    return await promise;
  } finally {
    pending.delete(slot);
  }
}
