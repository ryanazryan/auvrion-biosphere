import { and, eq } from "drizzle-orm";
import { isSignalClass } from "@/server/analytics/signal-taxonomy";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import { observationSignalEvents } from "@/server/db/analytics-signal-schema";
import { observations } from "@/server/db/observation-domain-schema";
import { isUuid } from "@/server/observations/observation-input";
import {
  readTaskJson,
  sameOrigin,
  taskResponseHeaders,
} from "@/server/workflow/task-route-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: taskResponseHeaders });
const invalidControls = (value: string) =>
  Array.from(value).some((ch) => {
    const n = ch.charCodeAt(0);
    return n < 32 && ![9, 10, 13].includes(n);
  });

/** Operator-authored candidate only. Device/model claims may NOT enter via browser. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const query = new URL(request.url).searchParams;
  const org = query.get("organizationId");
  if (
    !isUuid(id) ||
    !isUuid(org) ||
    query.size !== 1 ||
    query.getAll("organizationId").length !== 1
  ) {
    return reply({ error: "INVALID_SIGNAL_SCOPE" }, 400);
  }
  if (!sameOrigin(request)) return reply({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  const access = await checkOperationalAccess(org, "operator");
  if (!access.allowed) return reply({ error: access.reason }, access.status);
  const parsed = await readTaskJson(request);
  if (!parsed.ok) return reply({ error: parsed.error }, parsed.status);
  const value = parsed.body;
  const keys = Object.keys(value);
  const note = value.note;
  if (
    keys.length !== 3 ||
    keys.some((k) => !["requestId", "signalClass", "note"].includes(k)) ||
    !isUuid(value.requestId) ||
    !isSignalClass(value.signalClass) ||
    typeof note !== "string" ||
    note.trim().length < 20 ||
    note.length > 1500 ||
    invalidControls(note)
  ) {
    return reply({ error: "INVALID_SIGNAL_INPUT" }, 400);
  }
  try {
    const db = getDb();
    const [observation] = await db
      .select({ id: observations.id })
      .from(observations)
      .where(and(eq(observations.id, id), eq(observations.organizationId, org)))
      .limit(1);
    if (!observation) return reply({ error: "NOT_FOUND" }, 404);
    const [created] = await db
      .insert(observationSignalEvents)
      .values({
        organizationId: org,
        observationId: id,
        requestId: value.requestId,
        signalClass: value.signalClass,
        evidenceOrigin: "operator_assessment",
        note: note.trim(),
        createdByUserId: access.userId,
      })
      .onConflictDoNothing({
        target: [
          observationSignalEvents.organizationId,
          observationSignalEvents.requestId,
        ],
      })
      .returning({ id: observationSignalEvents.id });
    if (created) return reply({ signalId: created.id, replayed: false }, 201);
    const [existing] = await db
      .select({
        id: observationSignalEvents.id,
        signalClass: observationSignalEvents.signalClass,
        note: observationSignalEvents.note,
        observationId: observationSignalEvents.observationId,
        createdByUserId: observationSignalEvents.createdByUserId,
        evidenceOrigin: observationSignalEvents.evidenceOrigin,
      })
      .from(observationSignalEvents)
      .where(
        and(
          eq(observationSignalEvents.organizationId, org),
          eq(observationSignalEvents.requestId, value.requestId),
        ),
      )
      .limit(1);
    if (
      existing?.observationId !== id ||
      existing?.createdByUserId !== access.userId ||
      existing?.evidenceOrigin !== "operator_assessment" ||
      existing?.signalClass !== value.signalClass ||
      existing?.note !== note.trim()
    ) {
      return reply({ error: "SIGNAL_REQUEST_CONFLICT" }, 409);
    }
    return reply({ signalId: existing.id, replayed: true }, 200);
  } catch {
    return reply({ error: "SIGNAL_SAVE_UNAVAILABLE" }, 503);
  }
}
