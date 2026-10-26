/** Read-only presentation helpers. Never modify the stored decimal or UTC timestamp. */
import type { IndonesianTimeZone } from "@/figma-operator/time";

const ZONE_NAMES: Record<IndonesianTimeZone, string> = {
  WIB: "Asia/Jakarta",
  WITA: "Asia/Makassar",
  WIT: "Asia/Jayapura",
};

/** Preserve every significant decimal digit while removing DB NUMERIC(16,6) padding. */
export function formatMeasurementValue(
  raw: string | number | null | undefined,
): string {
  if (raw === null || raw === undefined) return "—";
  const value = String(raw).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value || "—";
  const whole = match[2].replace(/^0+(?=\d)/, "");
  const fractional = (match[3] ?? "").replace(/0+$/, "");
  return `${match[1]}${whole}${fractional ? `,${fractional}` : ""}`;
}

/** UTC -> human-readable civil time. Unknown/invalid inputs never silently become now. */
export function formatEvidenceTime(
  value: Date | string | null | undefined,
  zone: IndonesianTimeZone = "WITA",
): string {
  if (value === null || value === undefined || value === "")
    return "Tidak tersedia";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Tidak tersedia";
  const text = new Intl.DateTimeFormat("id-ID", {
    timeZone: ZONE_NAMES[zone],
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${text} ${zone}`;
}

export function sourceKindLabel(kind: string): string {
  switch (kind) {
    case "manual":
      return "Input manual Operator";
    case "listen_device":
      return "Perangkat IoT LISTEN (bioakustik)";
    case "prevent_device":
      return "Perangkat IoT PREVENT (lingkungan)";
    case "visual_device":
      return "Perangkat visual";
    case "external_provider":
      return "Penyedia data eksternal";
    default:
      return "Sumber belum diklasifikasikan";
  }
}

export function ingestionModeLabel(mode: string): string {
  switch (mode) {
    case "simulation":
      return "Simulasi — bukan data lapangan nyata";
    case "historical":
      return "Historis";
    case "live":
      return "Terkini (belum tentu terverifikasi)";
    default:
      return "Mode belum diketahui";
  }
}
