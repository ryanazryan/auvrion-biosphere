import { checkOperationalAccess } from "@/server/authorization/operational-access";
import {
  CopilotUnavailable,
  generateCopilotAnswer,
} from "@/server/copilot/answer";
import { EXACT_UUID } from "@/server/copilot/decision";
import { readScopedIntelligence } from "@/server/copilot/intelligence";
import {
  getNasaHotspots,
  isWebgisDays,
  isWebgisRegion,
} from "@/server/gis/nasa-hotspots";
import { trustedBrowserOrigin } from "@/server/security/trusted-browser-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers });
const limiter = new Map<string, number[]>();
function mayAsk(key: string) {
  const now = Date.now();
  if (limiter.size > 1000) limiter.clear();
  const previous = (limiter.get(key) ?? []).filter((x) => now - x < 60_000);
  if (previous.length >= 4) return false;
  limiter.set(key, [...previous, now]);
  return true;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams;
  const org = query.get("organizationId");
  if (
    !org ||
    !EXACT_UUID.test(org) ||
    query.size !== 1 ||
    query.getAll("organizationId").length !== 1
  )
    return json({ error: "INVALID_ORGANIZATION" }, 400);
  if (!trustedBrowserOrigin(request, process.env))
    return json({ error: "CROSS_ORIGIN_DENIED" }, 403);
  const access = await checkOperationalAccess(org, "operator");
  if (!access.allowed) return json({ error: access.reason }, access.status);
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  )
    return json({ error: "INVALID_CONTENT_TYPE" }, 400);
  if (Number(request.headers.get("content-length") ?? 0) > 2000)
    return json({ error: "INVALID_BODY" }, 400);
  let data: unknown;
  try {
    const body = await request.text();
    if (body.length > 2000) return json({ error: "INVALID_BODY" }, 400);
    data = JSON.parse(body) as unknown;
  } catch {
    return json({ error: "INVALID_BODY" }, 400);
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    return json({ error: "INVALID_BODY" }, 400);
  const input = data as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (k) => !["question", "regionId", "days"].includes(k),
    ) ||
    typeof input.question !== "string" ||
    input.question.trim().length < 3 ||
    input.question.length > 450 ||
    typeof input.regionId !== "string" ||
    !isWebgisRegion(input.regionId) ||
    typeof input.days !== "number" ||
    !isWebgisDays(input.days)
  )
    return json({ error: "INVALID_BODY" }, 400);
  if (!mayAsk(`${access.organizationId}:${access.userId}`))
    return json({ error: "RATE_LIMITED" }, 429);
  try {
    // All facts are server resolved; ignore any supplied geometry, count, model decision or arbitrary URL.
    const [hotspots, internal] = await Promise.all([
      getNasaHotspots(input.regionId, input.days),
      readScopedIntelligence(access.organizationId),
    ]);
    const confidence = new Map<string, number>();
    let latestUtc: string | null = null;
    let frpTotal = 0;
    let frpSamples = 0;
    for (const feature of hotspots.features) {
      const c = feature.properties.confidence;
      confidence.set(c, (confidence.get(c) ?? 0) + 1);
      const stamp = feature.properties.acquiredAtUtc;
      if (!latestUtc || stamp > latestUtc) latestUtc = stamp;
      if (feature.properties.frpMw !== null) {
        frpTotal += feature.properties.frpMw;
        frpSamples++;
      }
    }
    const facts = {
      scope: {
        region: hotspots.regionLabel,
        bbox: hotspots.bbox,
        days: hotspots.days,
        dataRetrievedAtUtc: hotspots.retrievedAtUtc,
      },
      nasa: {
        sensor: hotspots.sensor,
        detectionsReturned: hotspots.count,
        confidenceCategories: Object.fromEntries(confidence),
        latestDetectionUtc: latestUtc,
        meanFrpMw: frpSamples
          ? Math.round((frpTotal / frpSamples) * 100) / 100
          : null,
        truncated: hotspots.truncated,
        invalidRows: hotspots.invalidRows,
        limitations: hotspots.limitations,
      },
      auvrion: {
        storedObservationsLast30Days: internal.totalInWindow,
        unreviewedObservationsAllTime: internal.unreviewedAllTime,
        domainCounts: internal.domains,
        partialSummary: internal.partial,
        // Internal counts are organization wide, not necessarily located inside selected FIRMS bbox.
        geographicRelationVerified: false,
      },
      unavailable: [
        "Kepadatan satwa terverifikasi",
        "Jarak hotspot ke perangkat",
        "Kejadian kebakaran terkonfirmasi",
        "Peta gambut resmi",
        "Risiko kerugian ekonomi",
        "Koneksi perangkat real-time",
      ],
    };
    const answer = await generateCopilotAnswer({
      question: `${input.question.trim()}\nGunakan hanya fakta WebGIS terlampir. Jika lokasi/dataset tidak tersedia, jelaskan batasannya. Jangan mengasumsikan seluruh data organisasi berada dalam bbox terpilih.`,
      mode: "environment",
      facts,
      sourceNames: ["NASA FIRMS", "Auvrion observations"],
    });
    return json({
      ...answer,
      scope: facts.scope,
      sources: [
        {
          name: "NASA FIRMS",
          url: "https://firms.modaps.eosdis.nasa.gov/api/area",
        },
      ],
      meta: { detections: hotspots.count, truncated: hotspots.truncated },
    });
  } catch (error) {
    if (error instanceof CopilotUnavailable)
      return json({ error: "AI_UNAVAILABLE" }, 503);
    return json({ error: "WEBGIS_CONTEXT_UNAVAILABLE" }, 503);
  }
}
