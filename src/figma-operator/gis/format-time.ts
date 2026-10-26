export type IndonesiaTimeZone =
  | "Asia/Jakarta"
  | "Asia/Makassar"
  | "Asia/Jayapura";

export const TIME_ZONE_OPTIONS = [
  { value: "Asia/Jakarta", label: "WIB" },
  { value: "Asia/Makassar", label: "WITA" },
  { value: "Asia/Jayapura", label: "WIT" },
] as const;

export function formatIndonesiaTime(
  value: string | null | undefined,
  timeZone: IndonesiaTimeZone = "Asia/Makassar",
): string {
  if (!value) return "Tidak tersedia";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Tidak tersedia";
  }

  const formatter = new Intl.DateTimeFormat("id-ID", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const abbreviation = {
    "Asia/Jakarta": "WIB",
    "Asia/Makassar": "WITA",
    "Asia/Jayapura": "WIT",
  }[timeZone];

  return `${formatter.format(date)} ${abbreviation}`;
}
