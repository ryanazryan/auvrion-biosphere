import "server-only";

const NAME = /^[A-Za-z][A-Za-z .-]{2,79}$/;
const TTL = 60 * 60_000;
const cached = new Map<string, { expires: number; value: SpeciesReference }>();

export type SpeciesReference = {
  query: string;
  lookupStatus: "available" | "partial" | "unavailable";
  gbif: null | {
    scientificName: string;
    rank: string | null;
    status: string | null;
    confidence: number | null;
    url: string | null;
  };
  inaturalist: null | {
    scientificName: string;
    rank: string | null;
    commonName: string | null;
    url: string;
  };
  limitations: string[];
};

async function boundedJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5_000),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok || Number(response.headers.get("content-length")) > 256_000)
    throw new Error("REFERENCE_UNAVAILABLE");
  const text = await response.text();
  if (text.length > 256_000) throw new Error("REFERENCE_TOO_LARGE");
  return JSON.parse(text) as unknown;
}
function record(item: unknown): Record<string, unknown> | null {
  return item && typeof item === "object" && !Array.isArray(item)
    ? (item as Record<string, unknown>)
    : null;
}
function text(item: unknown, max = 120): string | null {
  return typeof item === "string" && item.length > 0
    ? item.slice(0, max)
    : null;
}

/** Open taxonomic reference only. A match is not species detection or geographical occurrence. */
export async function getSpeciesReference(
  name: string,
): Promise<SpeciesReference> {
  const query = name.trim().replace(/\s+/g, " ");
  if (!NAME.test(query)) throw new Error("INVALID_SPECIES_QUERY");
  const key = query.toLowerCase();
  const hit = cached.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const gbifUrl = new URL("https://api.gbif.org/v1/species/match");
  gbifUrl.searchParams.set("name", query);
  const inatUrl = new URL("https://api.inaturalist.org/v1/taxa/autocomplete");
  inatUrl.searchParams.set("q", query);
  inatUrl.searchParams.set("per_page", "1");
  const [gbifRaw, inatRaw] = await Promise.all([
    boundedJson(gbifUrl).catch(() => null),
    boundedJson(inatUrl).catch(() => null),
  ]);
  const gbifRecord = record(gbifRaw);
  const gbifId =
    typeof gbifRecord?.usageKey === "number" &&
    Number.isSafeInteger(gbifRecord.usageKey) &&
    gbifRecord.usageKey > 0
      ? gbifRecord.usageKey
      : null;
  const gbif =
    gbifRecord &&
    gbifRecord.matchType !== "NONE" &&
    text(gbifRecord.scientificName)
      ? {
          scientificName: text(gbifRecord.scientificName) ?? query,
          rank: text(gbifRecord.rank, 40),
          status: text(gbifRecord.status, 50),
          confidence:
            typeof gbifRecord.confidence === "number"
              ? gbifRecord.confidence
              : null,
          url: gbifId ? `https://www.gbif.org/species/${gbifId}` : null,
        }
      : null;
  const inatRoot = record(inatRaw);
  const inatCandidates = inatRoot?.results;
  const inatCandidate = Array.isArray(inatCandidates)
    ? record(inatCandidates[0])
    : null;
  const inatId =
    typeof inatCandidate?.id === "number" &&
    Number.isSafeInteger(inatCandidate.id) &&
    inatCandidate.id > 0
      ? inatCandidate.id
      : null;
  const inaturalist =
    inatCandidate && inatId && text(inatCandidate.name)
      ? {
          scientificName: text(inatCandidate.name) ?? query,
          rank: text(inatCandidate.rank, 40),
          commonName: text(inatCandidate.preferred_common_name),
          url: `https://www.inaturalist.org/taxa/${inatId}`,
        }
      : null;
  const value: SpeciesReference = {
    query,
    lookupStatus:
      gbif && inaturalist
        ? "available"
        : gbif || inaturalist
          ? "partial"
          : "unavailable",
    gbif,
    inaturalist,
    limitations: [
      "Ini adalah referensi taksonomi, bukan identifikasi dari audio, bukti keberadaan di Kalimantan/Bali, atau verifikasi manusia.",
      "Hasil pencocokan nama dapat ambigu; perlu validasi ahli dan metadata kejadian.",
    ],
  };
  if (cached.size > 100) cached.clear();
  cached.set(key, { value, expires: Date.now() + TTL });
  return value;
}
