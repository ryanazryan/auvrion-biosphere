import type { IndonesianTimeZone } from "../time";

const IANA: Record<IndonesianTimeZone, string> = {
  WIB: "Asia/Jakarta",
  WITA: "Asia/Makassar",
  WIT: "Asia/Jayapura",
};

/** Render ISO UTC as `26 Oktober 2026, 10.10 WITA` without changing the stored value. */
export function formatReadableDateTime(
  value: string,
  zone: IndonesianTimeZone,
): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Tidak tersedia";
  const segments = new Intl.DateTimeFormat("id-ID", {
    timeZone: IANA[zone],
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    segments.find((p) => p.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")}, ${part("hour")}.${part("minute")} ${zone}`;
}
