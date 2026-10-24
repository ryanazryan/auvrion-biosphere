import {
  BioacousticDiscoveryError,
  listAuthorizedBioacousticSources,
} from "@/server/bioacoustics/source-discovery";
import { isUuid } from "@/server/observations/observation-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: HEADERS });
}

/** Metadata only; never returns WAV bytes, storage keys, access tokens or unverified predictions. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const query = new URL(request.url).searchParams;
  const org = query.get("organizationId");
  if (
    !isUuid(id) ||
    !isUuid(org) ||
    query.size !== 1 ||
    query.getAll("organizationId").length !== 1
  ) {
    return json({ error: "INVALID_BIOACOUSTIC_TARGET" }, 400);
  }
  try {
    const discovery = await listAuthorizedBioacousticSources({
      organizationId: org,
      observationId: id,
    });
    return json(discovery);
  } catch (error) {
    if (error instanceof BioacousticDiscoveryError)
      return json({ error: error.code }, error.status);
    // Intentionally avoid raw errors, SQL traces, model internals or file paths.
    return json({ error: "BIOACOUSTIC_DISCOVERY_UNAVAILABLE" }, 503);
  }
}
