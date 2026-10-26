import "server-only";

import {
  AIR_QUALITY_CITIES,
  type AirQualityPayload,
  type AirQualitySite,
  parseModelAirQuality,
} from "./air-quality-contract";

const UPSTREAM = "https://air-quality-api.open-meteo.com/v1/air-quality";
const CACHE_TTL = 20 * 60_000;
const MAX_BYTES = 250_000;
const POINT_CACHE_LIMIT = 60;
const CAVEATS = [
  "US AQI adalah indeks model atmosfer.",
  "CAMS Global memiliki resolusi sekitar 45 km; titik sampel tidak membuktikan kualitas udara tepat pada koordinat tersebut.",
  "Nilai model tidak membuktikan kebakaran atau sumber polusi tertentu.",
];

const siteCache: {
  until: number;
  fetchedAtUtc: string | null;
  result: AirQualitySite[] | null;
  pending: Promise<AirQualitySite[]> | null;
} = {
  until: 0,
  fetchedAtUtc: null,
  result: null,
  pending: null,
};
const pointCache = new Map<
  string,
  { until: number; fetchedAtUtc: string; result: AirQualitySite }
>();
const pendingPoints = new Map<string, Promise<AirQualitySite>>();

async function fetchModel(
  locations: ReadonlyArray<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  }>,
) {
  const url = new URL(UPSTREAM);
  url.searchParams.set(
    "latitude",
    locations.map((s) => s.latitude.toFixed(2)).join(","),
  );
  url.searchParams.set(
    "longitude",
    locations.map((s) => s.longitude.toFixed(2)).join(","),
  );
  url.searchParams.set("current", "us_aqi,pm2_5,pm10");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("domains", "cams_global");
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length") ?? "0") > MAX_BYTES
  )
    throw new Error("AIR_QUALITY_UPSTREAM_UNAVAILABLE");
  const raw = await response.text();
  if (raw.length > MAX_BYTES) throw new Error("AIR_QUALITY_UPSTREAM_TOO_LARGE");
  return parseModelAirQuality(JSON.parse(raw) as unknown, locations);
}

export async function getAirQualityCities(): Promise<AirQualityPayload> {
  let sites = siteCache.result;
  if (!sites || siteCache.until <= Date.now()) {
    const pending =
      siteCache.pending ??
      fetchModel(AIR_QUALITY_CITIES)
        .then((value) => {
          siteCache.result = value;
          siteCache.fetchedAtUtc = new Date().toISOString();
          siteCache.until = Date.now() + CACHE_TTL;
          return value;
        })
        .finally(() => {
          siteCache.pending = null;
        });
    siteCache.pending = pending;
    sites = await pending;
  }
  return {
    source: "Open-Meteo / CAMS Global",
    index: "US AQI",
    method: "atmospheric_model",
    retrievedAtUtc: siteCache.fetchedAtUtc ?? new Date().toISOString(),
    sites,
    limitations: CAVEATS,
  };
}

export async function getAirQualityAtPoint(
  latitude: number,
  longitude: number,
): Promise<AirQualityPayload> {
  // These coordinates must already have passed parseIndonesiaPoint (rounded to 0.1 degree).
  const key = `${latitude.toFixed(1)},${longitude.toFixed(1)}`;
  let sample = pointCache.get(key)?.result;
  const hit = pointCache.get(key);
  if (!hit || hit.until <= Date.now()) {
    let pending = pendingPoints.get(key);
    if (!pending) {
      pending = fetchModel([
        {
          id: `point-${key}`,
          name: "Titik pilihan (perkiraan)",
          latitude,
          longitude,
        },
      ])
        .then((result) => {
          const entry = result[0];
          if (!entry) throw new Error("AIR_QUALITY_EMPTY");
          if (pointCache.size >= POINT_CACHE_LIMIT) pointCache.clear();
          pointCache.set(key, {
            result: entry,
            until: Date.now() + CACHE_TTL,
            fetchedAtUtc: new Date().toISOString(),
          });
          return entry;
        })
        .finally(() => {
          pendingPoints.delete(key);
        });
      pendingPoints.set(key, pending);
    }
    sample = await pending;
  }
  if (!sample) throw new Error("AIR_QUALITY_EMPTY");
  return {
    source: "Open-Meteo / CAMS Global",
    index: "US AQI",
    method: "atmospheric_model",
    retrievedAtUtc:
      pointCache.get(key)?.fetchedAtUtc ?? new Date().toISOString(),
    sites: [sample],
    limitations: CAVEATS,
  };
}
