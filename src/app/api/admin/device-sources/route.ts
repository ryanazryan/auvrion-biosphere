import "server-only";

import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import { observationSources } from "@/server/db/observation-domain-schema";
import {
  readBounded,
  reply,
  trustedOrigin,
  UUID,
} from "@/server/device-ingestion/device-admin-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Creates an unprovisioned LISTEN source. Does NOT issue or rotate ESP32 credentials. */
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return reply({ error: "INVALID_ORIGIN" }, 403);
  const body = await readBounded(request);
  if (
    !body ||
    Object.keys(body).some(
      (key) => !["organizationId", "code", "label"].includes(key),
    ) ||
    typeof body.organizationId !== "string" ||
    !UUID.test(body.organizationId) ||
    typeof body.code !== "string" ||
    typeof body.label !== "string"
  ) {
    return reply({ error: "INVALID_REQUEST" }, 400);
  }
  const code = body.code.trim().toLowerCase();
  const label = body.label.trim();
  if (
    !/^[a-z][a-z0-9_-]{2,62}$/.test(code) ||
    label.length < 3 ||
    label.length > 100
  ) {
    return reply({ error: "INVALID_SOURCE_NAME" }, 400);
  }
  const authorized = await checkAdminAccess(
    body.organizationId,
    "manage_devices",
  );
  if (!authorized.allowed)
    return reply({ error: authorized.reason }, authorized.status);

  try {
    const rows = await getDb()
      .insert(observationSources)
      .values({
        organizationId: authorized.organizationId,
        code,
        label,
        kind: "listen_device",
        isActive: true,
      })
      .onConflictDoNothing()
      .returning({ id: observationSources.id });
    if (!rows.length)
      return reply({ error: "SOURCE_CODE_ALREADY_EXISTS" }, 409);
    return reply({ sourceId: rows[0].id, code, status: "unprovisioned" }, 201);
  } catch {
    return reply({ error: "SOURCE_CREATE_UNAVAILABLE" }, 503);
  }
}
