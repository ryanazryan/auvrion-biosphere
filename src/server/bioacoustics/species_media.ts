/** Reference imagery only: never equate a matching taxon photo with acoustic verification. */
export type SpeciesPhoto = {
  url: string;
  attribution: string;
  license: string;
  sourceUrl: string;
};

type InatPhoto = {
  medium_url?: string;
  attribution?: string;
  license_code?: string | null;
};
type InatTaxon = {
  id?: number;
  name?: string;
  default_photo?: InatPhoto | null;
};
const ALLOWED_LICENSES = new Set([
  "cc0",
  "cc-by",
  "cc-by-nc",
  "cc-by-sa",
  "cc-by-nc-sa",
  "cc-by-nd",
  "cc-by-nc-nd",
]);

export function parseSpeciesPhoto(
  name: string,
  candidates: InatTaxon[],
): SpeciesPhoto | null {
  const matching = candidates.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase(),
  );
  const image = matching?.default_photo;
  if (!image?.medium_url || !image.license_code || !matching?.id) return null;
  const license = image.license_code.toLowerCase();
  if (!ALLOWED_LICENSES.has(license)) return null;
  let parsed: URL;
  try {
    parsed = new URL(image.medium_url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    !(
      parsed.hostname === "static.inaturalist.org" ||
      parsed.hostname === "photos.inaturalist.org" ||
      parsed.hostname === "inaturalist-open-data.s3.amazonaws.com" ||
      parsed.hostname === "inaturalist-open-data.s3.us-west-2.amazonaws.com"
    )
  )
    return null;
  return {
    url: parsed.href,
    attribution:
      image.attribution?.trim().slice(0, 200) || "iNaturalist contributor",
    license: license.toUpperCase(),
    sourceUrl: `https://www.inaturalist.org/taxa/${matching.id}`,
  };
}

export async function lookupSpeciesPhoto(
  name: string,
  get: typeof fetch = fetch,
): Promise<SpeciesPhoto | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(name)}&rank=species&per_page=8&locale=en`;
    const response = await get(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data: { results?: InatTaxon[] } = await response.json();
    return parseSpeciesPhoto(
      name,
      Array.isArray(data.results) ? data.results : [],
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
