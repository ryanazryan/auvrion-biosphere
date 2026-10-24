/** WC-023: pure contract for an unverified bioacoustic candidate, NOT an inference model. */
export type BioacousticCandidate = {
  label: string;
  scientificName: string | null;
  modelScore: number;
  startMs: number | null;
  endMs: number | null;
};
export type BioacousticResult = {
  status: "succeeded" | "no_candidates";
  verification: "unverified";
  provider: string;
  modelId: string;
  modelVersion: string;
  candidates: BioacousticCandidate[];
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const allowedString = (v: unknown, max: number): v is string =>
  typeof v === "string" &&
  v.trim() === v &&
  v.length > 0 &&
  v.length <= max &&
  !/\p{Cc}/u.test(v);
const boundedTime = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 30_000;

/** Rejects unapproved model outputs, fabricated certainty and unsupported fields. */
export function parseBioacousticResult(
  value: unknown,
): BioacousticResult | null {
  if (!isRecord(value)) return null;
  const keys = [
    "status",
    "verification",
    "provider",
    "modelId",
    "modelVersion",
    "candidates",
  ];
  if (Object.keys(value).some((key) => !keys.includes(key))) return null;
  if (value.verification !== "unverified") return null;
  if (value.status !== "succeeded" && value.status !== "no_candidates")
    return null;
  if (
    !allowedString(value.provider, 100) ||
    !allowedString(value.modelId, 150) ||
    !allowedString(value.modelVersion, 100)
  )
    return null;
  if (!Array.isArray(value.candidates) || value.candidates.length > 10)
    return null;
  if (value.status === "no_candidates" && value.candidates.length !== 0)
    return null;
  if (value.status === "succeeded" && value.candidates.length === 0)
    return null;
  for (const candidate of value.candidates) {
    if (!isRecord(candidate)) return null;
    const expected = [
      "label",
      "scientificName",
      "modelScore",
      "startMs",
      "endMs",
    ];
    if (Object.keys(candidate).some((key) => !expected.includes(key)))
      return null;
    if (!allowedString(candidate.label, 180)) return null;
    if (
      candidate.scientificName !== null &&
      !allowedString(candidate.scientificName, 180)
    )
      return null;
    if (
      typeof candidate.modelScore !== "number" ||
      !Number.isFinite(candidate.modelScore) ||
      candidate.modelScore < 0 ||
      candidate.modelScore > 1
    )
      return null;
    if ((candidate.startMs === null) !== (candidate.endMs === null))
      return null;
    if (
      candidate.startMs !== null &&
      (!boundedTime(candidate.startMs) ||
        !boundedTime(candidate.endMs) ||
        candidate.endMs <= candidate.startMs)
    )
      return null;
  }
  return value as BioacousticResult;
}
