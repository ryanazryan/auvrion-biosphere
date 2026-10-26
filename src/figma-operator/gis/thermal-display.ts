/** UI-only FIRMS FRP bands, NOT official fire risk or verification status. */
export type FrpBand = "unavailable" | "low" | "medium" | "high";

function finiteNonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function frpBand(value: unknown): FrpBand {
  const mw = finiteNonnegative(value);
  if (mw === null) return "unavailable";
  if (mw >= 20) return "high";
  if (mw >= 5) return "medium";
  return "low";
}

export function formatFrp(value: unknown): string {
  const mw = finiteNonnegative(value);
  return mw === null
    ? "Tidak tersedia"
    : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(mw)} MW`;
}

export function formatBrightness(value: unknown): string {
  const kelvin = finiteNonnegative(value);
  if (kelvin === null || kelvin < 150 || kelvin > 500) return "Tidak tersedia";
  const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
  return `${number.format(kelvin)} K (setara ${number.format(kelvin - 273.15)} °C radiasi)`;
}

export function formatConfidence(value: unknown): string {
  switch (String(value ?? "").toLowerCase()) {
    case "l":
      return "Low (kelas deteksi NASA)";
    case "n":
      return "Nominal (kelas deteksi NASA)";
    case "h":
      return "High (kelas deteksi NASA)";
    default:
      return "Tidak tersedia";
  }
}
