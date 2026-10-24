import "server-only";
import {
  manageError,
  permitted,
  readBounded,
  reply,
  trustedOrigin,
  UUID,
} from "@/server/device-ingestion/device-admin-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/devices — one-time credential is returned only after durable commit. */
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return reply({ error: "INVALID_ORIGIN" }, 403);
  const body = await readBounded(request);
  if (
    !body ||
    Object.keys(body).some((k) => k !== "organizationId" && k !== "sourceId") ||
    typeof body.organizationId !== "string" ||
    typeof body.sourceId !== "string" ||
    !UUID.test(body.organizationId) ||
    !UUID.test(body.sourceId)
  )
    return reply({ error: "INVALID_REQUEST" }, 400);
  try {
    const auth = await permitted(body.organizationId);
    if (!auth.allowed) return auth.response;
    const result = await auth.lifecycle.provision(auth.actor, body.sourceId);
    return reply(
      {
        deviceId: result.deviceId,
        credential: result.token,
        version: result.version,
      },
      201,
    );
  } catch (error) {
    return manageError(error);
  }
}
