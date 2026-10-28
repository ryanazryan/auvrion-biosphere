/** Public fixed-city model sampling. These coordinates do not represent private observations. */
export const AIR_QUALITY_CITIES = [
  { id: "banda-aceh", name: "Banda Aceh", latitude: 5.55, longitude: 95.32 },
  { id: "medan", name: "Medan", latitude: 3.59, longitude: 98.67 },
  { id: "pekanbaru", name: "Pekanbaru", latitude: 0.53, longitude: 101.45 },
  { id: "jambi", name: "Jambi", latitude: -1.61, longitude: 103.61 },
  { id: "palembang", name: "Palembang", latitude: -2.99, longitude: 104.76 },
  { id: "jakarta", name: "Jakarta", latitude: -6.21, longitude: 106.85 },
  { id: "bandung", name: "Bandung", latitude: -6.92, longitude: 107.61 },
  { id: "semarang", name: "Semarang", latitude: -6.97, longitude: 110.42 },
  { id: "yogyakarta", name: "Yogyakarta", latitude: -7.8, longitude: 110.37 },
  { id: "surabaya", name: "Surabaya", latitude: -7.26, longitude: 112.75 },
  { id: "denpasar", name: "Denpasar", latitude: -8.67, longitude: 115.22 },
  { id: "mataram", name: "Mataram", latitude: -8.58, longitude: 116.11 },
  { id: "kupang", name: "Kupang", latitude: -10.18, longitude: 123.61 },
  { id: "pontianak", name: "Pontianak", latitude: -0.03, longitude: 109.34 },
  {
    id: "banjarmasin",
    name: "Banjarmasin",
    latitude: -3.32,
    longitude: 114.59,
  },
  { id: "banjarbaru", name: "Banjarbaru", latitude: -3.44, longitude: 114.83 },
  {
    id: "palangka-raya",
    name: "Palangka Raya",
    latitude: -2.21,
    longitude: 113.92,
  },
  { id: "balikpapan", name: "Balikpapan", latitude: -1.24, longitude: 116.85 },
  { id: "samarinda", name: "Samarinda", latitude: -0.5, longitude: 117.15 },
  { id: "tarakan", name: "Tarakan", latitude: 3.31, longitude: 117.59 },
  { id: "makassar", name: "Makassar", latitude: -5.15, longitude: 119.43 },
  { id: "manado", name: "Manado", latitude: 1.49, longitude: 124.84 },
  { id: "palu", name: "Palu", latitude: -0.9, longitude: 119.87 },
  { id: "ambon", name: "Ambon", latitude: -3.7, longitude: 128.18 },
  { id: "sorong", name: "Sorong", latitude: -0.88, longitude: 131.25 },
  { id: "jayapura", name: "Jayapura", latitude: -2.59, longitude: 140.67 },
] as const;

export type AirQualitySite = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  usAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  modelTimeUtc: string | null;
  /** Source-model timestamp used for displayed US AQI; differs when hourly fallback was needed. */
  aqiTimeUtc?: string | null;
};

export type AirQualityPayload = {
  source: "Open-Meteo / CAMS Global";
  index: "US AQI";
  method: "atmospheric_model";
  retrievedAtUtc: string;
  sites: AirQualitySite[];
  limitations: string[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function numeric(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

/** Current responses are ISO local-to-API timezone; requests use UTC. */
export function parseModelAirQuality(
  data: unknown,
  locations: ReadonlyArray<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  }>,
): AirQualitySite[] {
  const raw = Array.isArray(data) ? data : [data];
  if (raw.length !== locations.length)
    throw new Error("AQI_RESPONSE_COUNT_MISMATCH");
  return locations.map((loc, index) => {
    const source = record(raw[index]);
    const current = record(source?.current);
    const time = current?.time;
    const utc =
      typeof time === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(time)
        ? `${time}Z`
        : null;
    let usAqi = numeric(current?.us_aqi, 0, 500);
    let aqiTimeUtc: string | null = usAqi !== null ? utc : null;
    // Open-Meteo may return valid PM concentrations while current.us_aqi is null.
    // Only reuse the model's OWN most recent hourly US AQI, never a PM-based guess.
    // Reject future values and values more than two hours behind the current model time.
    if (usAqi === null && utc) {
      const hourly = record(source?.hourly);
      const times = Array.isArray(hourly?.time) ? hourly.time : [];
      const values = Array.isArray(hourly?.us_aqi) ? hourly.us_aqi : [];
      const nowMs = Date.parse(utc);
      let bestMs = -Infinity;
      for (let i = 0; i < Math.min(times.length, values.length); i++) {
        const at = times[i];
        if (
          typeof at !== "string" ||
          !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(at)
        )
          continue;
        const timestamp = `${at}Z`;
        const stampMs = Date.parse(timestamp);
        const delta = nowMs - stampMs;
        const value = numeric(values[i], 0, 500);
        if (
          value !== null &&
          Number.isFinite(stampMs) &&
          delta >= 0 &&
          delta <= 2 * 60 * 60_000 &&
          stampMs > bestMs
        ) {
          bestMs = stampMs;
          usAqi = value;
          aqiTimeUtc = timestamp;
        }
      }
    }
    return {
      id: loc.id,
      name: loc.name,
      latitude: loc.latitude,
      longitude: loc.longitude,
      usAqi,
      pm25: numeric(current?.pm2_5, 0, 2000),
      pm10: numeric(current?.pm10, 0, 4000),
      modelTimeUtc: utc,
      aqiTimeUtc,
    };
  });
}

export function parseIndonesiaPoint(latitude: unknown, longitude: unknown) {
  const lat =
    typeof latitude === "string" && /^-?\d{1,2}(?:\.\d{1,6})?$/.test(latitude)
      ? Number(latitude)
      : NaN;
  const lon =
    typeof longitude === "string" && /^-?\d{1,3}(?:\.\d{1,6})?$/.test(longitude)
      ? Number(longitude)
      : NaN;
  // Geographic envelope, not a legal Indonesia boundary; validation is deliberately conservative.
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -12 ||
    lat > 7 ||
    lon < 94 ||
    lon > 142
  )
    return null;
  // Avoid disclosing exact user-selected coordinates to third-party model provider.
  return {
    latitude: Math.round(lat * 10) / 10,
    longitude: Math.round(lon * 10) / 10,
  };
}
