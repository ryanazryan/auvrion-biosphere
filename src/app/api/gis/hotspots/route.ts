import { checkOperationalAccess } from "@/server/authorization/operational-access";
import {
  getNasaHotspots,
  isWebgisDays,
  isWebgisRegion,
} from "@/server/gis/nasa-hotspots";
import { isUuid } from "@/server/observations/observation-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const json = (data: unknown, status = 200) =>
  Response.json(data, { headers, status });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  if (
    [...q.keys()].some(
      (key) => !["organizationId", "regionId", "days"].includes(key),
    ) ||
    q.size !== 3 ||
    ["organizationId", "regionId", "days"].some(
      (key) => q.getAll(key).length !== 1,
    )
  )
    return json({ error: "INVALID_REQUEST" }, 400);
  const organizationId = q.get("organizationId") ?? "";
  const regionId = q.get("regionId") ?? "";
  const dayString = q.get("days") ?? "";
  const days = Number(dayString);
  if (
    !isUuid(organizationId) ||
    !isWebgisRegion(regionId) ||
    !/^[125]$/.test(dayString) ||
    !isWebgisDays(days)
  ) {
    return json({ error: "INVALID_FILTER" }, 400);
  }
  const operator = await checkOperationalAccess(organizationId, "operator");
  if (!operator.allowed) {
    if (operator.reason !== "ROLE_OR_SCOPE_DENIED")
      return json({ error: operator.reason }, operator.status);
    const supervisor = await checkOperationalAccess(
      organizationId,
      "supervisor",
    );
    if (!supervisor.allowed)
      return json({ error: supervisor.reason }, supervisor.status);
  }
  try {
    return json(await getNasaHotspots(regionId, days));
  } catch {
    return json({ error: "NASA_HOTSPOTS_UNAVAILABLE" }, 503);
  }
}
