import "server-only";

import { and, eq } from "drizzle-orm";
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

type Context = { params: Promise<{ id: string }> };

/** Edit display label only. Device ID, code, token, scope and audit are unchanged. */
export async function PATCH(request: Request, context: Context) {
  if (!trustedOrigin(request)) return reply({ error: "INVALID_ORIGIN" }, 403);
  const { id } = await context.params;
  if (!UUID.test(id)) return reply({ error: "INVALID_SOURCE_ID" }, 400);
  const body = await readBounded(request);
  if (
    !body ||
    Object.keys(body).some(
      (key) => !["organizationId", "label"].includes(key),
    ) ||
    typeof body.organizationId !== "string" ||
    !UUID.test(body.organizationId) ||
    typeof body.label !== "string"
  )
    return reply({ error: "INVALID_REQUEST" }, 400);
  const label = body.label.trim();
  if (
    label.length < 3 ||
    label.length > 100 ||
    Array.from(label).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  ) {
    return reply({ error: "INVALID_LABEL" }, 400);
  }
  const authorized = await checkAdminAccess(
    body.organizationId,
    "manage_devices",
  );
  if (!authorized.allowed)
    return reply({ error: authorized.reason }, authorized.status);
  try {
    const changed = await getDb()
      .update(observationSources)
      .set({ label })
      .where(
        and(
          eq(observationSources.id, id),
          eq(observationSources.organizationId, authorized.organizationId),
          eq(observationSources.kind, "listen_device"),
        ),
      )
      .returning({
        id: observationSources.id,
        label: observationSources.label,
      });
    if (!changed.length) return reply({ error: "SOURCE_NOT_FOUND" }, 404);
    return reply({ sourceId: changed[0].id, label: changed[0].label });
  } catch {
    return reply({ error: "SOURCE_UPDATE_UNAVAILABLE" }, 503);
  }
}
