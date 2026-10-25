import "server-only";

import {
  type EnvironmentalContext,
  getEnvironmentalContext,
  SOURCE_LINKS,
} from "@/server/environment/context";
import {
  type BoundingBox,
  parseBmkg,
  parseBoundingBox,
  parseFirms,
} from "@/server/environment/contracts";

export type RegionPreset = {
  id: string;
  label: string;
  adm4: string;
  bbox: string;
};
const ADM4 = /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/;
const ID = /^[a-z][a-z0-9-]{1,35}$/;
const TTL_MS = 15 * 60_000;
const areaCache = new Map<
  string,
  { until: number; value: EnvironmentalContext }
>();

export class CopilotRegionError extends Error {
  constructor() {
    super("REGION_NOT_CONFIGURED");
  }
}
function parsePresets(): RegionPreset[] {
  const raw = process.env.AUVRION_REGIONS_JSON;
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw) as unknown;
  } catch {
    throw new CopilotRegionError();
  }
  if (!Array.isArray(list) || list.length > 8) throw new CopilotRegionError();
  const presets: RegionPreset[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new CopilotRegionError();
    const r = item as Record<string, unknown>;
    if (
      typeof r.id !== "string" ||
      !ID.test(r.id) ||
      typeof r.label !== "string" ||
      r.label.length > 80 ||
      typeof r.adm4 !== "string" ||
      !ADM4.test(r.adm4) ||
      typeof r.bbox !== "string"
    )
      throw new CopilotRegionError();
    try {
      parseBoundingBox(r.bbox);
    } catch {
      throw new CopilotRegionError();
    }
    if (presets.some((preset) => preset.id === r.id))
      throw new CopilotRegionError();
    presets.push({ id: r.id, label: r.label, adm4: r.adm4, bbox: r.bbox });
  }
  return presets;
}

/** Only server-configured regions; never accept arbitrary client ADM4/BBOX or URL. */
export function resolveRegion(
  question: string,
  requestedId?: string,
): RegionPreset | null {
  const presets = parsePresets();
  if (requestedId) {
    const region = presets.find((r) => r.id === requestedId);
    if (!region) throw new CopilotRegionError();
    return region;
  }
  const q = question.toLowerCase();
  const namedCandidates = presets.filter((r) => {
    const aliases = [
      r.id.replace(/-/g, " "),
      r.label.toLowerCase(),
      r.label.split(/[—,]/)[0]?.trim().toLowerCase() ?? "",
    ];
    return aliases.some(
      (alias) =>
        alias.length >= 4 &&
        new RegExp(
          `\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`,
          "i",
        ).test(q),
    );
  });
  if (namedCandidates.length > 1) throw new CopilotRegionError();
  if (namedCandidates.length === 1) return namedCandidates[0] ?? null;
  // Explicit non-demo geographic requests must never silently use Banjarbaru.
  if (
    /\b(bali|denpasar|jakarta|bandung|surabaya|yogyakarta|makassar|papua|medan|lombok)\b/i.test(
      question,
    )
  ) {
    throw new CopilotRegionError();
  }
  return null;
}

async function bounded(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) > 1_000_000
  )
    throw new Error("UPSTREAM_UNAVAILABLE");
  const content = await response.text();
  if (content.length > 1_000_000) throw new Error("UPSTREAM_TOO_LARGE");
  return content;
}

export async function getCopilotEnvironment(
  organizationId: string,
  preset: RegionPreset | null,
): Promise<EnvironmentalContext> {
  if (!preset) return getEnvironmentalContext(organizationId);
  if (
    process.env.AUVRION_EXTERNAL_ORGANIZATION_ID?.toLowerCase() !==
    organizationId.toLowerCase()
  ) {
    throw new CopilotRegionError();
  }
  const cacheKey = `${organizationId}:${preset.id}`;
  const hit = areaCache.get(cacheKey);
  if (hit && hit.until > Date.now()) return hit.value;
  const box: BoundingBox = parseBoundingBox(preset.bbox);
  const key = process.env.AUVRION_FIRMS_MAP_KEY;
  const keyOk = typeof key === "string" && /^[a-zA-Z0-9]{24,64}$/.test(key);
  const [bmkg, nasa] = await Promise.all([
    (async () => {
      try {
        const url = new URL("https://api.bmkg.go.id/publik/prakiraan-cuaca");
        url.searchParams.set("adm4", preset.adm4);
        return {
          state: "available" as const,
          retrievedAtUtc: new Date().toISOString(),
          data: parseBmkg(
            JSON.parse(await bounded(url.toString())) as unknown,
            preset.adm4,
          ),
        };
      } catch {
        return {
          state: "unavailable" as const,
          reason: "upstream_error" as const,
        };
      }
    })(),
    (async () => {
      if (!keyOk)
        return {
          state: "unavailable" as const,
          reason: "missing_key" as const,
        };
      try {
        // Secret-bearing upstream URL is never returned or logged.
        const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_NOAA20_NRT/${box.join(",")}/2`;
        return {
          state: "available" as const,
          retrievedAtUtc: new Date().toISOString(),
          data: parseFirms(await bounded(url), box),
        };
      } catch {
        return {
          state: "unavailable" as const,
          reason: "upstream_error" as const,
        };
      }
    })(),
  ]);
  const value: EnvironmentalContext = {
    region: preset.label,
    retrievedAtUtc: new Date().toISOString(),
    bmkg,
    nasa,
    sources: SOURCE_LINKS,
    limitations: [
      `BMKG mewakili ADM4 ${preset.adm4} (kelurahan/desa), bukan seluruh wilayah ${preset.label}.`,
      "NASA FIRMS mencakup bbox yang telah disetujui administrator; bukan konfirmasi kebakaran.",
      "Hasil tidak membuktikan kondisi di lokasi presisi tertentu dan tidak menggantikan verifikasi lapangan.",
    ],
  };
  if (areaCache.size > 16) areaCache.clear();
  areaCache.set(cacheKey, {
    until:
      Date.now() +
      (bmkg.state === "available" || nasa.state === "available"
        ? TTL_MS
        : 60_000),
    value,
  });
  return value;
}
