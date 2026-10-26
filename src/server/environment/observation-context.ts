import "server-only";

import { and, eq } from "drizzle-orm";
import {
  configuredRegionForPoint,
  getCopilotEnvironment,
} from "@/server/copilot/regions";
import { getDb } from "@/server/db";
import { observations } from "@/server/db/observation-domain-schema";
import {
  type EnvironmentalContext,
  RegionConfigError,
  SOURCE_LINKS,
  thermal,
} from "./context";
import { observationCell } from "./observation-cell";

// Bounded per-process cache. For multi-instance deployment use shared caching and quotas.
const CACHE_TTL = 15 * 60_000;
const cache = new Map<string, { until: number; value: EnvironmentalContext }>();

/** Strict org-scoped environmental-risk reference; never exports raw observation coordinates. */
export async function getObservationEnvironmentalContext(
  organizationId: string,
  observationId: string,
): Promise<EnvironmentalContext | null> {
  if (
    process.env.AUVRION_EXTERNAL_ORGANIZATION_ID?.toLowerCase() !==
    organizationId.toLowerCase()
  ) {
    throw new RegionConfigError();
  }
  const [row] = await getDb()
    .select({
      domain: observations.domain,
      latitude: observations.latitude,
      longitude: observations.longitude,
    })
    .from(observations)
    .where(
      and(
        eq(observations.id, observationId),
        eq(observations.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!row) return null;
  if (row.domain !== "environmental_risk") return null;

  if (row.latitude === null || row.longitude === null) {
    return {
      region: "Lokasi observasi tidak diketahui",
      retrievedAtUtc: new Date().toISOString(),
      bmkg: { state: "unavailable", reason: "region_unmapped" },
      nasa: { state: "unavailable", reason: "region_unmapped" },
      sources: SOURCE_LINKS,
      limitations: [
        "Observasi tidak mempunyai koordinat; referensi geografis tidak dapat ditentukan.",
      ],
    };
  }

  // Admin-maintained presets must identify the actual observation area.
  const preset = configuredRegionForPoint(row.latitude, row.longitude);
  if (preset) {
    return getCopilotEnvironment(organizationId, preset);
  }

  // Without a verified ADM4, do not re-use the organization's Banjarbaru forecast.
  // NASA is queried for a coarse grid, not a claim about the exact observation point.
  const box = observationCell(row.latitude, row.longitude);
  const cacheKey = `${organizationId}:${box.join(",")}:${process.env.AUVRION_FIRMS_MAP_KEY ? "configured" : "missing"}`;
  const previous = cache.get(cacheKey);
  if (previous && previous.until > Date.now()) return previous.value;

  const nasa = await thermal(box);
  const value: EnvironmentalContext = {
    region: "Area sekitar observasi · grid 1°",
    retrievedAtUtc: new Date().toISOString(),
    bmkg: { state: "unavailable", reason: "region_unmapped" },
    nasa,
    sources: SOURCE_LINKS,
    limitations: [
      "Kode wilayah BMKG (ADM4) belum dipetakan secara tervalidasi untuk titik observasi ini; prakiraan BMKG tidak ditampilkan.",
      "NASA FIRMS merangkum anomali termal pada sel geografis 1° yang mencakup observasi, bukan pada satu titik sensor.",
      "Deteksi satelit tidak mengonfirmasi kebakaran; tidak ada deteksi bukan jaminan aman.",
    ],
  };
  for (const [key, item] of cache) {
    if (item.until <= Date.now()) cache.delete(key);
  }
  if (cache.size >= 64) cache.delete(cache.keys().next().value ?? "");
  cache.set(cacheKey, {
    until: Date.now() + (nasa.state === "available" ? CACHE_TTL : 60_000),
    value,
  });
  return value;
}
