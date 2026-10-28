import "server-only";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import {
  type PlaceResult,
  parsePhotonPlaces,
  validPlaceQuery,
} from "@/server/gis/location-search";
import { createPointRateLimiter } from "@/server/gis/point-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const reply = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) => Response.json(body, { status, headers: { ...HEADERS, ...extra } });
const userLimiter = createPointRateLimiter({
  limit: 18,
  windowMs: 60_000,
  maxEntries: 300,
});
const cached = new Map<string, { until: number; results: PlaceResult[] }>();
const pending = new Map<string, Promise<PlaceResult[]>>();
let lastExternalRequestAt = 0;

async function authorizedUserId(org: string): Promise<string | null> {
  for (const role of ["operator", "supervisor", "ranger"] as const) {
    const result = await checkOperationalAccess(org, role);
    if (result.allowed) return result.userId;
    if (result.reason !== "ROLE_OR_SCOPE_DENIED") return null;
  }
  // The existing admin UI is development-only. Keep this privilege distinct
  // from operational role grants; no admin bypass of MFA/account checks.
  if (
    process.env.NODE_ENV === "development" &&
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS === "YES"
  ) {
    for (const capability of ["manage_access", "manage_devices"] as const) {
      const result = await checkAdminAccess(org, capability);
      if (result.allowed) return result.userId;
    }
  }
  return null;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error("GEOCODER_UNAVAILABLE");
  const MAX = 96_000;
  if (Number(response.headers.get("content-length") || "0") > MAX)
    throw new Error("GEOCODER_TOO_LARGE");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("GEOCODER_EMPTY");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX) {
        await reader.cancel();
        throw new Error("GEOCODER_TOO_LARGE");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  ) as unknown;
}

/** Read-only, MFA-scoped Indonesian place suggestions. Never uses user GPS coordinates. */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  if (
    params.size !== 2 ||
    params.getAll("organizationId").length !== 1 ||
    params.getAll("q").length !== 1 ||
    [...params.keys()].some((key) => !["organizationId", "q"].includes(key))
  ) {
    return reply({ error: "INVALID_QUERY" }, 400);
  }
  const org = params.get("organizationId") ?? "";
  const query = validPlaceQuery(params.get("q") ?? "");
  if (!UUID.test(org) || !query) return reply({ error: "INVALID_QUERY" }, 400);
  const user = await authorizedUserId(org);
  if (!user) return reply({ error: "ACCESS_DENIED" }, 403);
  const budget = userLimiter.consume(`${org}:${user}`);
  if (!budget.allowed)
    return reply({ error: "RATE_LIMITED" }, 429, {
      "Retry-After": String(budget.retryAfterSeconds),
    });

  const cacheKey = query.toLocaleLowerCase("id-ID");
  const hit = cached.get(cacheKey);
  if (hit && hit.until > Date.now())
    return reply({ results: hit.results, source: "Photon / OpenStreetMap" });
  const inFlight = pending.get(cacheKey);
  if (inFlight) {
    try {
      return reply({
        results: await inFlight,
        source: "Photon / OpenStreetMap",
      });
    } catch {
      return reply({ error: "LOCATION_SEARCH_UNAVAILABLE" }, 503);
    }
  }
  // Public Photon demo server: keep process-wide requests below 1/s.
  // Multi-process deployments must use a distributed limiter or private geocoder.
  if (Date.now() - lastExternalRequestAt < 1_200)
    return reply({ error: "RATE_LIMITED" }, 429, { "Retry-After": "2" });
  lastExternalRequestAt = Date.now();
  const task = (async () => {
    const upstream = new URL("https://photon.komoot.io/api/");
    upstream.searchParams.set("q", query);
    upstream.searchParams.set("bbox", "94,-12,142,8");
    upstream.searchParams.set("countrycode", "ID");
    upstream.searchParams.set("limit", "6");
    // Keep provider-native Indonesian names when translations are unavailable.
    const response = await fetch(upstream, {
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
      headers: { Accept: "application/json" },
    });
    const places = parsePhotonPlaces(await readBoundedJson(response));
    if (cached.size > 150) cached.clear();
    cached.set(cacheKey, { until: Date.now() + 5 * 60_000, results: places });
    return places;
  })();
  pending.set(cacheKey, task);
  try {
    return reply({ results: await task, source: "Photon / OpenStreetMap" });
  } catch {
    return reply({ error: "LOCATION_SEARCH_UNAVAILABLE" }, 503);
  } finally {
    pending.delete(cacheKey);
  }
}
