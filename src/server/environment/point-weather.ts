import "server-only";

/** Forecast over a coarse 0.1-degree cell, never a physical sensor measurement. */
export type PointForecast =
  | {
      state: "available";
      provider: "Open-Meteo";
      retrievedAtUtc: string;
      validAtUtc: string;
      temperatureC: number | null;
      humidityPct: number | null;
      precipitationMm: number | null;
      windKmh: number | null;
      precision: "rounded_0_1_degree";
    }
  | { state: "unavailable"; reason: "invalid_location" | "upstream_error" };

const cache = new Map<string, { expires: number; value: PointForecast }>();
const MAX_BYTES = 48_000;

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function objects(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Pure decoder: fail closed on malformed provider responses. */
export function parsePointForecast(
  raw: unknown,
  now: Date,
): PointForecast | null {
  if (!objects(raw) || !objects(raw.hourly)) return null;
  const hourly = raw.hourly;
  const times = hourly.time;
  if (!Array.isArray(times) || times.length === 0 || times.length > 100)
    return null;
  const fields = [
    hourly.temperature_2m,
    hourly.relative_humidity_2m,
    hourly.precipitation,
    hourly.wind_speed_10m,
  ];
  if (
    fields.some(
      (value) => !Array.isArray(value) || value.length !== times.length,
    )
  )
    return null;

  const index = times.findIndex(
    (value) =>
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
      new Date(`${value}:00Z`).getTime() >= now.getTime() - 60_000,
  );
  if (index < 0) return null;
  const iso = `${times[index]}:00Z`;
  if (!Number.isFinite(Date.parse(iso))) return null;
  const values = fields.map((field) =>
    numberOrNull((field as unknown[])[index]),
  );
  if (values.every((value) => value === null)) return null;
  return {
    state: "available",
    provider: "Open-Meteo",
    retrievedAtUtc: now.toISOString(),
    validAtUtc: iso,
    temperatureC: values[0] ?? null,
    humidityPct: values[1] ?? null,
    precipitationMm: values[2] ?? null,
    windKmh: values[3] ?? null,
    precision: "rounded_0_1_degree",
  };
}

export async function getPointForecast(
  latitude: number,
  longitude: number,
): Promise<PointForecast> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  )
    return { state: "unavailable", reason: "invalid_location" };
  // Externally queried coarse cell, not sensitive precise observation coordinates.
  const lat = (Math.round(latitude * 10) / 10).toFixed(1);
  const lon = (Math.round(longitude * 10) / 10).toFixed(1);
  const key = `${lat}:${lon}`;
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.value;
  let result: PointForecast = {
    state: "unavailable",
    reason: "upstream_error",
  };
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat);
    url.searchParams.set("longitude", lon);
    url.searchParams.set(
      "hourly",
      "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
    );
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("forecast_days", "2");
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    if (
      !response.ok ||
      Number(response.headers.get("content-length")) > MAX_BYTES
    )
      throw Error("UPSTREAM_UNAVAILABLE");
    const text = await response.text();
    if (text.length > MAX_BYTES) throw Error("UPSTREAM_TOO_LARGE");
    result =
      parsePointForecast(JSON.parse(text) as unknown, new Date()) ?? result;
  } catch {
    // Fail closed. Never replace missing forecast with an invented value.
  }
  if (cache.size >= 128) cache.clear();
  cache.set(key, {
    value: result,
    expires: Date.now() + (result.state === "available" ? 15 * 60_000 : 60_000),
  });
  return result;
}
