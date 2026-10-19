/** Indonesian civil-time helpers for Operator UI. No local-machine timezone assumptions. */
export type IndonesianTimeZone = "WIB" | "WITA" | "WIT";

const ZONES = {
  WIB: { offsetMs: 7 * 60 * 60 * 1000, suffix: "+07:00" },
  WITA: { offsetMs: 8 * 60 * 60 * 1000, suffix: "+08:00" },
  WIT: { offsetMs: 9 * 60 * 60 * 1000, suffix: "+09:00" },
} as const;

export function isIndonesianZone(value: unknown): value is IndonesianTimeZone {
  return value === "WIB" || value === "WITA" || value === "WIT";
}

export function zoneFromBrowser(
  ianaTimeZone: string,
): IndonesianTimeZone | null {
  const name = ianaTimeZone.toLowerCase();
  if (["asia/jakarta", "asia/pontianak"].includes(name)) return "WIB";
  if (["asia/makassar", "asia/ujung_pandang"].includes(name)) return "WITA";
  if (["asia/jayapura"].includes(name)) return "WIT";
  return null;
}

/** ISO UTC timestamp -> YYYY-MM-DDTHH:mm in a chosen Indonesian timezone. */
export function isoToZoneLocal(iso: string, zone: IndonesianTimeZone): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp))
    throw new RangeError("INVALID_ISO_TIMESTAMP");
  return new Date(timestamp + ZONES[zone].offsetMs).toISOString().slice(0, 16);
}

/** YYYY-MM-DDTHH:mm and explicit timezone -> ISO UTC timestamp. */
export function zoneLocalToIso(
  local: string,
  zone: IndonesianTimeZone,
): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) {
    throw new RangeError("INVALID_LOCAL_DATETIME");
  }
  const timestamp = Date.parse(`${local}:00${ZONES[zone].suffix}`);
  if (!Number.isFinite(timestamp))
    throw new RangeError("INVALID_LOCAL_DATETIME");
  const iso = new Date(timestamp).toISOString();
  if (isoToZoneLocal(iso, zone) !== local) {
    throw new RangeError("INVALID_LOCAL_DATETIME");
  }
  return iso;
}

/** Only call from effects / user actions; never as a module-level SSR constant. */
export function nowInZone(zone: IndonesianTimeZone): string {
  return isoToZoneLocal(new Date().toISOString(), zone);
}

export function isFutureLocalTime(
  local: string,
  zone: IndonesianTimeZone,
  nowMs = Date.now(),
): boolean {
  return Date.parse(zoneLocalToIso(local, zone)) > nowMs;
}

export function fmtTs(
  iso: string,
  zone: IndonesianTimeZone,
  withZone = true,
): string {
  return (
    isoToZoneLocal(iso, zone).replace("T", " ") + (withZone ? ` ${zone}` : "")
  );
}
