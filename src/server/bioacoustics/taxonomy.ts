/** Verified name matching ONLY. Never treats a taxonomic match as evidence of audio identification. */
import { lookupSpeciesPhoto } from "./species_media";

export const BINOMIAL = /^[A-Z][a-z-]+ [a-z][a-z-]+$/;

type GbifMatch = {
  matchType?: string;
  rank?: string;
  status?: string;
  canonicalName?: string;
  usageKey?: number;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
};
type Vernacular = { vernacularName?: string; language?: string };

export function readGbifMatch(name: string, match: GbifMatch) {
  // GBIF may return a fuzzy/higher-rank match. Suppress taxonomy rather than showing
  // confidently filled taxon metadata for a different or ambiguous label.
  if (
    match.matchType !== "EXACT" ||
    match.rank !== "SPECIES" ||
    !match.canonicalName ||
    match.canonicalName.toLowerCase() !== name.toLowerCase() ||
    !Number.isSafeInteger(match.usageKey) ||
    (match.usageKey ?? 0) <= 0
  ) {
    return null;
  }
  return {
    name: match.canonicalName,
    key: match.usageKey as number,
    kingdom: match.kingdom ?? null,
    phylum: match.phylum ?? null,
    className: match.class ?? null,
    order: match.order ?? null,
    family: match.family ?? null,
    genus: match.genus ?? null,
    species: match.species ?? null,
    taxonomicStatus: match.status ?? "UNKNOWN",
    sourceUrl: `https://www.gbif.org/species/${match.usageKey}`,
  };
}

export function readVernaculars(input: Vernacular[]) {
  const safe = input.filter((item) => !!item.vernacularName?.trim());
  return {
    commonNameIndonesian:
      safe.find((item) =>
        ["ind", "id", "bahasa indonesia"].includes(
          (item.language ?? "").toLowerCase(),
        ),
      )?.vernacularName ?? null,
    commonNameEnglish:
      safe.find((item) =>
        ["eng", "en", "english"].includes((item.language ?? "").toLowerCase()),
      )?.vernacularName ?? null,
  };
}

export async function lookupGbifTaxonomy(
  name: string,
  get: typeof fetch = fetch,
) {
  if (!BINOMIAL.test(name))
    return { state: "unsupported" as const, taxonomy: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const matchUrl = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}&strict=true`;
    const response = await get(matchUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error("GBIF_UNAVAILABLE");
    const match: GbifMatch = await response.json();
    const verified = readGbifMatch(name, match);
    if (!verified) return { state: "unmatched" as const, taxonomy: null };
    let commonNameIndonesian: string | null = null;
    let commonNameEnglish: string | null = null;
    try {
      const namesResponse = await get(
        `https://api.gbif.org/v1/species/${verified.key}/vernacularNames?limit=100`,
        {
          headers: { Accept: "application/json" },
          signal: controller.signal,
          cache: "no-store",
        },
      );
      if (namesResponse.ok) {
        const names: { results?: Vernacular[] } = await namesResponse.json();
        const labels = readVernaculars(
          Array.isArray(names.results) ? names.results : [],
        );
        commonNameIndonesian = labels.commonNameIndonesian;
        commonNameEnglish = labels.commonNameEnglish;
      }
    } catch {
      // Common names are optional. Keep the verified scientific classification.
    }
    const photo = await lookupSpeciesPhoto(verified.name, get);
    return {
      state: "matched" as const,
      taxonomy: { ...verified, commonNameIndonesian, commonNameEnglish, photo },
    };
  } catch {
    return { state: "unavailable" as const, taxonomy: null };
  } finally {
    clearTimeout(timeout);
  }
}
