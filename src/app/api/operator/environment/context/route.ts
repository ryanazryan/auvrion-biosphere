import "server-only";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import {
  getEnvironmentalContext,
  RegionConfigError,
} from "@/server/environment/context";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const respond = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams,
    org = q.get("organizationId");
  if (
    !org ||
    !UUID.test(org) ||
    q.size !== 1 ||
    q.getAll("organizationId").length !== 1
  )
    return respond({ error: "INVALID_REQUEST" }, 400);
  const auth = await checkOperationalAccess(org, "operator");
  if (!auth.allowed) return respond({ error: auth.reason }, auth.status);
  try {
    return respond(await getEnvironmentalContext(auth.organizationId));
  } catch (e) {
    return respond(
      {
        error:
          e instanceof RegionConfigError
            ? e.message
            : "ENVIRONMENTAL_CONTEXT_UNAVAILABLE",
      },
      503,
    );
  }
}
