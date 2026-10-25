/** Pure WC024 parsers. No client location, keys or external I/O. */
export type BoundingBox = readonly [number, number, number, number];
export function parseBoundingBox(raw: string): BoundingBox {
  const v = raw.split(",").map((x) => Number(x.trim()));
  if (
    v.length !== 4 ||
    v.some((x) => !Number.isFinite(x)) ||
    v[0] < -180 ||
    v[2] > 180 ||
    v[1] < -90 ||
    v[3] > 90 ||
    v[0] >= v[2] ||
    v[1] >= v[3] ||
    v[2] - v[0] > 12 ||
    v[3] - v[1] > 12
  )
    throw new Error("INVALID_BBOX");
  return v as unknown as BoundingBox;
}
export type BmkgItem = {
  utc: string;
  local: string | null;
  tempC: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  description: string | null;
};
export type BmkgData = {
  kind: "forecast";
  adm4: string;
  location: string | null;
  intervals: BmkgItem[];
};
const record = (x: unknown): Record<string, unknown> | null =>
  x !== null && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : null;
const text = (x: unknown) => (typeof x === "string" ? x.slice(0, 120) : null);
const numeric = (x: unknown) =>
  (typeof x === "number" || typeof x === "string") &&
  x !== "" &&
  Number.isFinite(Number(x))
    ? Number(x)
    : null;
export function parseBmkg(raw: unknown, adm4: string): BmkgData {
  const root = record(raw),
    days = root?.data,
    loc = record(root?.lokasi);
  if (!root || !Array.isArray(days)) throw new Error("INVALID_BMKG");
  const intervals: BmkgItem[] = [];
  for (const group of days)
    for (const day of (record(group)?.cuaca as unknown[]) ?? []) {
      if (!Array.isArray(day)) continue;
      for (const entry of day) {
        const r = record(entry),
          s = text(r?.utc_datetime);
        if (!s || !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s)) continue;
        const date = new Date(`${s.replace(" ", "T")}Z`);
        if (Number.isNaN(date.getTime())) continue;
        intervals.push({
          utc: date.toISOString(),
          local: text(r?.local_datetime),
          tempC: numeric(r?.t),
          humidityPct: numeric(r?.hu),
          windKmh: numeric(r?.ws),
          description: text(r?.weather_desc),
        });
      }
    }
  if (!intervals.length) throw new Error("BMKG_NO_FORECAST");
  intervals.sort((a, b) => a.utc.localeCompare(b.utc));
  return {
    kind: "forecast",
    adm4,
    location: text(loc?.desa ?? loc?.kelurahan ?? loc?.kecamatan),
    intervals: intervals.slice(0, 24),
  };
}
function cells(line: string): string[] {
  const result: string[] = [];
  let value = "",
    quote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quote && line[i + 1] === '"') {
        value += '"';
        i++;
      } else quote = !quote;
    } else if (c === "," && !quote) {
      result.push(value.trim());
      value = "";
    } else value += c;
  }
  if (quote) throw new Error("INVALID_CSV");
  result.push(value.trim());
  return result;
}
export type FirmsData = {
  kind: "satellite_thermal_detections";
  sensor: "VIIRS_NOAA20_NRT";
  windowDays: 2;
  count: number;
  latestUtc: string | null;
  confidenceCodes: Record<string, number>;
};
export function parseFirms(raw: string, box: BoundingBox): FirmsData {
  const rows = raw.trim().split(/\r?\n/),
    fields = cells(rows[0] || "").map((x) => x.toLowerCase());
  const required = [
    "latitude",
    "longitude",
    "acq_date",
    "acq_time",
    "confidence",
  ];
  if (required.some((k) => !fields.includes(k)))
    throw new Error("INVALID_FIRMS_SCHEMA");
  const get = (r: string[], k: string) => r[fields.indexOf(k)] ?? "";
  let count = 0,
    latestUtc: string | null = null;
  const confidenceCodes: Record<string, number> = {};
  for (const line of rows.slice(1)) {
    if (!line.trim()) continue;
    const r = cells(line),
      lat = numeric(get(r, "latitude")),
      lon = numeric(get(r, "longitude"));
    if (
      lat === null ||
      lon === null ||
      lat < box[1] ||
      lat > box[3] ||
      lon < box[0] ||
      lon > box[2]
    )
      continue;
    const day = get(r, "acq_date"),
      clock = get(r, "acq_time").padStart(4, "0");
    if (
      !/^\d{4}-\d\d-\d\d$/.test(day) ||
      !/^\d{4}$/.test(clock) ||
      Number(clock.slice(0, 2)) > 23 ||
      Number(clock.slice(2)) > 59
    )
      continue;
    const d = new Date(`${day}T${clock.slice(0, 2)}:${clock.slice(2)}:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const t = d.toISOString();
    if (!latestUtc || latestUtc < t) latestUtc = t;
    const code = get(r, "confidence").slice(0, 12) || "unknown";
    confidenceCodes[code] = (confidenceCodes[code] || 0) + 1;
    count++;
  }
  return {
    kind: "satellite_thermal_detections",
    sensor: "VIIRS_NOAA20_NRT",
    windowDays: 2,
    count,
    latestUtc,
    confidenceCodes,
  };
}
