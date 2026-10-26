/** Presentation adapter for actual Perch 2.0 uncalibrated raw scores. */
export type RawCandidate = {
  label: string;
  scientificName: string | null;
  modelScore: number;
  startMs: number | null;
  endMs: number | null;
};
export type RawInference = {
  status: "succeeded" | "no_candidates";
  verification: "unverified";
  provider: string;
  modelId: string;
  modelVersion: string;
  candidates: RawCandidate[];
  mediaId: string;
  audioSha256: string;
  analyzedAt: string;
  persistence: "ephemeral_result";
};
export type CandidateView = RawCandidate & {
  category:
    | "species_candidate"
    | "general_animal"
    | "sound_event"
    | "unclassified";
  displayName: string;
  genus: string | null;
  epithet: string | null;
  taxonomySource: string | null;
};
const GENERIC = new Set([
  "animal",
  "animals",
  "wild_animals",
  "domestic_animals_and_pets",
  "domestic_sounds_and_home_sounds",
  "bird",
  "birds",
  "mammal",
  "mammals",
  "insect",
  "insects",
  "amphibian",
  "amphibians",
  "dog",
  "cat",
]);
const EVENTS = new Set([
  "bark",
  "barking",
  "howl",
  "howling",
  "chirp",
  "chirping",
  "call",
  "calls",
  "singing",
  "rustling",
  "wingbeats",
  "footsteps",
  "clock",
  "wind",
  "rain",
  "speech",
  "noise",
  "mechanisms",
]);
/** Only label-pattern recognition, never an authoritative taxonomic lookup. */
const LATIN_BINOMIAL = /^[A-Z][a-z-]+ [a-z][a-z-]+$/;
export function presentCandidate(item: RawCandidate): CandidateView {
  const label = item.label.trim().slice(0, 180);
  const key = label.toLowerCase().replaceAll(" ", "_");
  const explicitName = item.scientificName?.trim() ?? "";
  const possibleBinomial =
    explicitName || (LATIN_BINOMIAL.test(label) ? label : "");
  const parsed = LATIN_BINOMIAL.test(possibleBinomial)
    ? possibleBinomial.split(" ")
    : [];
  const category = EVENTS.has(key)
    ? "sound_event"
    : GENERIC.has(key)
      ? "general_animal"
      : parsed.length === 2
        ? "species_candidate"
        : "unclassified";
  return {
    ...item,
    category,
    displayName: label.replaceAll("_", " "),
    genus: parsed[0] ?? null,
    epithet: parsed[1] ?? null,
    // Must remain null until authoritative taxonomy source is added to repo.
    taxonomySource: null,
  };
}

export function rankCandidates(items: RawCandidate[]): CandidateView[] {
  return [...items]
    .filter((c) => !!c.label.trim() && Number.isFinite(c.modelScore))
    .sort((a, b) => b.modelScore - a.modelScore)
    .map(presentCandidate);
}

/** Relative graphical contrast only. Neither percentage nor calibrated confidence. */
export function relativeBar(score: number, all: number[]): number {
  const finite = all.filter(Number.isFinite);
  if (!finite.length) return 0;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) return 72;
  return 15 + (85 * (score - min)) / (max - min);
}
