/**
 * Advisory classification vocabulary. A signal is NOT a confirmed fire, wildlife
 * sighting, illegal logging offence or poaching incident.
 */
export const SIGNAL_CLASSES = [
  "fire_indicator",
  "chainsaw_like",
  "gunshot_like",
  "human_activity",
  "biodiversity_signal",
  "unclassified",
] as const;

export type SignalClass = (typeof SIGNAL_CLASSES)[number];

export const SIGNAL_LABELS: Record<SignalClass, string> = {
  fire_indicator: "Indikasi risiko kebakaran",
  chainsaw_like: "Suara menyerupai chainsaw",
  gunshot_like: "Suara menyerupai tembakan",
  human_activity: "Aktivitas manusia terindikasi",
  biodiversity_signal: "Sinyal biodiversitas",
  unclassified: "Belum diklasifikasi",
};

export const SIGNAL_COLORS: Record<SignalClass, string> = {
  fire_indicator: "#DF845A",
  chainsaw_like: "#BB9265",
  gunshot_like: "#BA6F83",
  human_activity: "#6A83BC",
  biodiversity_signal: "#238C79",
  unclassified: "#9AA6AC",
};

export type ReviewStatus = "unreviewed" | "corroborated" | "rejected";

export function isSignalClass(value: unknown): value is SignalClass {
  return typeof value === "string" && SIGNAL_CLASSES.some((x) => x === value);
}

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return (
    value === "unreviewed" || value === "corroborated" || value === "rejected"
  );
}

/** Model scores are only comparable within the same calibrated model version. */
export function validCalibratedProbability(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}
