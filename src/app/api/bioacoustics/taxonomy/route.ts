import "server-only";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { BINOMIAL, lookupGbifTaxonomy } from "@/server/bioacoustics/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: HEADERS });
}

/** One public GBIF lookup per selected candidate, restricted to scoped, MFA-assured Operators. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const organizationId = params.get("organizationId");
  const name = params.get("name")?.trim();
  if (
    !organizationId ||
    !UUID.test(organizationId) ||
    !name ||
    !BINOMIAL.test(name) ||
    name.length > 120 ||
    params.size !== 2 ||
    params.getAll("name").length !== 1 ||
    params.getAll("organizationId").length !== 1
  ) {
    return reply({ error: "INVALID_TAXONOMY_REQUEST" }, 400);
  }
  const access = await checkOperationalAccess(organizationId, "operator");
  if (!access.allowed) return reply({ error: access.reason }, access.status);
  const data = await lookupGbifTaxonomy(name);
  return reply(data, data.state === "unavailable" ? 503 : 200);
}
