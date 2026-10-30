import { and, eq } from "drizzle-orm";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import { observationSignalEvents } from "@/server/db/analytics-signal-schema";
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

/** Human corroboration / rejection of an advisory signal; does not confirm a crime or fire. */
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
  const access = await checkOperationalAccess(org, "supervisor");
  if (!access.allowed) return reply({ error: access.reason }, access.status);
  const parsed = await readTaskJson(request);
  if (!parsed.ok) return reply({ error: parsed.error }, parsed.status);
  const value = parsed.body;
  const note = value.note;
  const keys = Object.keys(value);
  if (
    keys.length !== 3 ||
    keys.some(
      (k) => !["expectedVersion", "reviewStatus", "note"].includes(k),
    ) ||
    (value.reviewStatus !== "corroborated" &&
      value.reviewStatus !== "rejected") ||
    !Number.isSafeInteger(value.expectedVersion) ||
    Number(value.expectedVersion) < 1 ||
    typeof note !== "string" ||
    note.trim().length < 20 ||
    note.length > 1500 ||
    invalidControls(note)
  ) {
    return reply({ error: "INVALID_REVIEW_INPUT" }, 400);
  }
  try {
    const db = getDb();
    const [updated] = await db
      .update(observationSignalEvents)
      .set({
        reviewStatus: value.reviewStatus,
        reviewedByUserId: access.userId,
        reviewNote: note.trim(),
        reviewedAt: new Date(),
        version: Number(value.expectedVersion) + 1,
      })
      .where(
        and(
          eq(observationSignalEvents.id, id),
          eq(observationSignalEvents.organizationId, org),
          eq(observationSignalEvents.reviewStatus, "unreviewed"),
          eq(observationSignalEvents.version, Number(value.expectedVersion)),
        ),
      )
      .returning({
        id: observationSignalEvents.id,
        version: observationSignalEvents.version,
      });
    if (updated)
      return reply({ signalId: updated.id, version: updated.version });
    return reply({ error: "SIGNAL_NOT_FOUND_OR_ALREADY_REVIEWED" }, 409);
  } catch {
    return reply({ error: "SIGNAL_REVIEW_UNAVAILABLE" }, 503);
  }
}
