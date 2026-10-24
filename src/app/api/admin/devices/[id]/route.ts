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
type Context = { params: Promise<{ id: string }> };

/** POST /api/admin/devices/{id} — actions: rotate or revoke. */
export async function POST(request: Request, context: Context) {
  if (!trustedOrigin(request)) return reply({ error: "INVALID_ORIGIN" }, 403);
  const { id } = await context.params;
  if (!UUID.test(id)) return reply({ error: "INVALID_REQUEST" }, 400);
  const body = await readBounded(request);
  if (
    !body ||
    Object.keys(body).some((k) => k !== "organizationId" && k !== "action") ||
    typeof body.organizationId !== "string" ||
    !UUID.test(body.organizationId) ||
    (body.action !== "rotate" && body.action !== "revoke")
  )
    return reply({ error: "INVALID_REQUEST" }, 400);
  try {
    const auth = await permitted(body.organizationId);
    if (!auth.allowed) return auth.response;
    if (body.action === "revoke") {
      await auth.lifecycle.revoke(auth.actor, id);
      return reply({ deviceId: id, status: "revoked" });
    }
    const result = await auth.lifecycle.rotate(auth.actor, id);
    return reply({
      deviceId: result.deviceId,
      credential: result.token,
      version: result.version,
    });
  } catch (error) {
    return manageError(error);
  }
}
