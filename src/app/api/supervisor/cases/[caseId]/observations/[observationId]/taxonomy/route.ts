import "server-only";
import { latestUnverifiedAnalysis } from "@/server/bioacoustics/analysis-handoff";
import { BINOMIAL, lookupGbifTaxonomy } from "@/server/bioacoustics/taxonomy";
import { isUuid } from "@/server/observations/observation-input";
import {
  findWorkspaceAccess,
  getWorkspaceCase,
} from "@/server/workflow/workspace-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const reply = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: HEADERS });
export async function GET(
  request: Request,
  { params }: { params: Promise<{ caseId: string; observationId: string }> },
) {
  const { caseId, observationId } = await params;
  const search = new URL(request.url).searchParams;
  const name = search.get("name") ?? "";
  if (
    !isUuid(caseId) ||
    !isUuid(observationId) ||
    search.size !== 1 ||
    search.getAll("name").length !== 1 ||
    !BINOMIAL.test(name) ||
    name.length > 120
  )
    return reply({ error: "INVALID_REQUEST" }, 400);
  const access = await findWorkspaceAccess("supervisor");
  if (!access.allowed) return reply({ error: access.reason }, access.status);
  try {
    const detail = await getWorkspaceCase(access.organizationId, caseId);
    const observation = detail?.observations.find(
      (o) => o.id === observationId,
    );
    if (
      observation?.domain !== "biodiversity" ||
      observation.evidence?.sourceKind !== "listen_device"
    ) {
      return reply({ error: "CASE_OBSERVATION_NOT_FOUND" }, 404);
    }
    const current = await latestUnverifiedAnalysis(
      access.organizationId,
      observationId,
    );
    if (
      !current?.candidates.some(
        (c) => c.scientificName === name || c.label === name,
      )
    ) {
      return reply({ error: "CANDIDATE_NOT_FOUND" }, 404);
    }
    const result = await lookupGbifTaxonomy(name);
    return reply(result, result.state === "unavailable" ? 503 : 200);
  } catch {
    return reply({ error: "REFERENCE_UNAVAILABLE" }, 503);
  }
}
