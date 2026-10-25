import "server-only";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { EXACT_UUID } from "@/server/copilot/decision";
import { getSpeciesReference } from "@/server/copilot/species";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };
function reply(value: unknown, status = 200) {
  return Response.json(value, { status, headers: HEADERS });
}
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const organizationId = query.get("organizationId");
  const name = query.get("name");
  if (
    !organizationId ||
    !EXACT_UUID.test(organizationId) ||
    !name ||
    query.size !== 2 ||
    query.getAll("organizationId").length !== 1 ||
    query.getAll("name").length !== 1
  )
    return reply({ error: "INVALID_REQUEST" }, 400);
  const access = await checkOperationalAccess(organizationId, "operator");
  if (!access.allowed) return reply({ error: access.reason }, access.status);
  try {
    return reply(await getSpeciesReference(name));
  } catch {
    return reply({ error: "SPECIES_REFERENCE_UNAVAILABLE" }, 503);
  }
}
