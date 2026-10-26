import { checkOperationalAccess } from "@/server/authorization/operational-access";
import {
  getAirQualityAtPoint,
  getAirQualityCities,
} from "@/server/gis/air-quality";
import { parseIndonesiaPoint } from "@/server/gis/air-quality-contract";
import { isUuid } from "@/server/observations/observation-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });
// Bounded per-session-user point inspection to protect the no-key noncommercial provider.
// Replace with a shared distributed limiter before production deployment.
const pointBudgets = new Map<string, { until: number; count: number }>();
function allowPoint(userId: string, organizationId: string): boolean {
  if (pointBudgets.size > 300) pointBudgets.clear();
  const key = `${organizationId}:${userId}`;
  const now = Date.now();
  const existing = pointBudgets.get(key);
  if (!existing || existing.until <= now) {
    pointBudgets.set(key, { until: now + 10 * 60_000, count: 1 });
    return true;
  }
  if (existing.count >= 24) return false;
  existing.count += 1;
  return true;
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const organizationId = query.get("organizationId") ?? "";
  const hasLat = query.has("latitude");
  const hasLon = query.has("longitude");
  if (
    !isUuid(organizationId) ||
    query.getAll("organizationId").length !== 1 ||
    [...query.keys()].some(
      (key) => !["organizationId", "latitude", "longitude"].includes(key),
    ) ||
    hasLat !== hasLon ||
    (hasLat &&
      (query.getAll("latitude").length !== 1 ||
        query.getAll("longitude").length !== 1)) ||
    query.size !== (hasLat ? 3 : 1)
  )
    return json({ error: "INVALID_QUERY" }, 400);
  let point: { latitude: number; longitude: number } | null = null;
  if (hasLat) {
    point = parseIndonesiaPoint(query.get("latitude"), query.get("longitude"));
    if (!point) return json({ error: "INVALID_LOCATION" }, 400);
  }
  let authorizedUserId: string | null = null;
  for (const role of ["operator", "supervisor", "ranger"] as const) {
    const access = await checkOperationalAccess(organizationId, role);
    if (access.allowed) {
      authorizedUserId = access.userId;
      break;
    }
    if (access.reason !== "ROLE_OR_SCOPE_DENIED")
      return json({ error: access.reason }, access.status);
  }
  if (!authorizedUserId) return json({ error: "ROLE_OR_SCOPE_DENIED" }, 403);
  if (point && !allowPoint(authorizedUserId, organizationId))
    return json({ error: "RATE_LIMITED" }, 429);
  try {
    return json(
      point
        ? await getAirQualityAtPoint(point.latitude, point.longitude)
        : await getAirQualityCities(),
    );
  } catch {
    return json({ error: "AIR_QUALITY_UNAVAILABLE" }, 503);
  }
}
