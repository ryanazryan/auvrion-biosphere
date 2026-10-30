import "server-only";
import { Pool } from "pg";
import { findRangerWorkspaceAccess } from "@/server/ranger/ranger-workspace";
import { findWorkspaceAccess } from "@/server/workflow/workspace-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
type Role = "operator" | "supervisor" | "ranger";
type Notification = {
  key: string;
  title: string;
  href: string;
  at: string;
  read: boolean;
};
let pool: Pool | undefined;
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });

function db(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!pool)
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}
function parseRole(request: Request): Role | null {
  const query = new URL(request.url).searchParams;
  if (query.size !== 1 || query.getAll("role").length !== 1) return null;
  const role = query.get("role");
  return role === "operator" || role === "supervisor" || role === "ranger"
    ? role
    : null;
}
async function scope(role: Role) {
  if (role === "ranger") return findRangerWorkspaceAccess();
  return findWorkspaceAccess(role);
}
function sqlForRole(role: Role) {
  if (role === "operator")
    return `
    SELECT 'wav:' || r.id::text AS event_key,
           'WAV diterima · ' || s.code AS title,
           '/operator/observations/' || r.observation_id::text AS href,
           r.created_at AS event_time
      FROM ingestion_recordings r
      JOIN ingestion_devices d ON d.id = r.device_id AND d.organization_id = r.organization_id
      JOIN observation_sources s ON s.id = d.source_id AND s.organization_id = d.organization_id
     WHERE r.organization_id = $1 AND s.kind = 'listen_device' AND r.ingestion_mode <> 'simulation'
    UNION ALL
    SELECT 'case:' || c.id::text, 'Case dibuat · ' || left(c.title, 90),
           '/operator/review/' || c.id::text, c.created_at
      FROM domain_cases c
     WHERE c.organization_id = $1 AND c.opened_by_user_id = $2
    ORDER BY event_time DESC LIMIT 30`;
  if (role === "supervisor")
    return `
    SELECT 'supervisor:' || e.id::text AS event_key,
           'Case menunggu keputusan · ' || left(c.title, 75) AS title,
           '/supervisor/decisions/' || e.case_id::text AS href,
           e.created_at AS event_time
      FROM case_transition_events e
      JOIN domain_cases c ON c.id = e.case_id AND c.organization_id = e.organization_id
     WHERE e.organization_id = $1 AND e.to_status = 'awaiting_decision'
    ORDER BY e.created_at DESC LIMIT 30`;
  return `
    SELECT 'ranger:' || a.id::text AS event_key,
           'Penugasan · ' || left(t.title, 90) AS title,
           '/ranger/tasks/' || a.task_id::text AS href,
           a.assigned_at AS event_time
      FROM task_assignments a
      JOIN domain_tasks t ON t.id = a.task_id AND t.organization_id = a.organization_id
     WHERE a.organization_id = $1 AND a.ranger_user_id = $2 AND a.unassigned_at IS NULL
    ORDER BY a.assigned_at DESC LIMIT 30`;
}

async function load(
  role: Role,
  organizationId: string,
  userId: string,
): Promise<Notification[]> {
  const client = db();
  const [cursor, events] = await Promise.all([
    client.query<{ cleared_at: Date }>(
      `SELECT cleared_at FROM workspace_notification_clears
       WHERE organization_id = $1 AND user_id = $2 AND role = $3`,
      [organizationId, userId, role],
    ),
    client.query<{
      event_key: string;
      title: string;
      href: string;
      event_time: Date;
    }>(
      sqlForRole(role),
      role === "supervisor" ? [organizationId] : [organizationId, userId],
    ),
  ]);
  const cutoff = cursor.rows[0]?.cleared_at
    ? new Date(cursor.rows[0].cleared_at).getTime()
    : -Infinity;
  const visible = events.rows.filter(
    (event) => new Date(event.event_time).getTime() > cutoff,
  );
  const keys = visible.map((event) => event.event_key);
  if (!keys.length) return [];
  const seen = await client.query<{ event_key: string }>(
    `SELECT event_key FROM workspace_notification_reads
     WHERE organization_id = $1 AND user_id = $2 AND event_key = ANY($3::text[])`,
    [organizationId, userId, keys],
  );
  const read = new Set(seen.rows.map((event) => event.event_key));
  return visible.map((event) => ({
    key: event.event_key,
    title: event.title,
    href: event.href,
    at: new Date(event.event_time).toISOString(),
    read: read.has(event.event_key),
  }));
}

export async function GET(request: Request) {
  const role = parseRole(request);
  if (!role) return reply({ error: "INVALID_REQUEST" }, 400);
  const access = await scope(role);
  if (!access.allowed) return reply({ error: access.reason }, access.status);
  try {
    const items = await load(role, access.organizationId, access.userId);
    return reply({ items, unread: items.filter((item) => !item.read).length });
  } catch {
    return reply({ error: "NOTIFICATIONS_UNAVAILABLE" }, 503);
  }
}

export async function POST(request: Request) {
  const role = parseRole(request);
  if (!role) return reply({ error: "INVALID_REQUEST" }, 400);
  const origin = request.headers.get("origin");
  const target = new URL(request.url);
  if (
    !origin ||
    origin !== target.origin ||
    !request.headers.get("content-type")?.startsWith("application/json")
  ) {
    return reply({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  }
  const access = await scope(role);
  if (!access.allowed) return reply({ error: access.reason }, access.status);
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 2048) {
      return reply({ error: "BODY_TOO_LARGE" }, 413);
    }
    const body = await request.text();
    if (body.length > 2048) return reply({ error: "BODY_TOO_LARGE" }, 413);
    const payload: unknown = JSON.parse(body);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return reply({ error: "INVALID_REQUEST" }, 400);
    }
    const input = payload as Record<string, unknown>;
    if (Object.keys(input).length === 1 && input.action === "clear") {
      // Hides all events currently in the feed, never deletes their source records.
      // Isolated by org, account AND workspace role.
      await db().query(
        `INSERT INTO workspace_notification_clears (user_id, organization_id, role, cleared_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, organization_id, role)
         DO UPDATE SET cleared_at = GREATEST(
           workspace_notification_clears.cleared_at, EXCLUDED.cleared_at
         )`,
        [access.userId, access.organizationId, role],
      );
      return reply({ cleared: true });
    }
    if (
      Object.keys(input).length !== 1 ||
      !Array.isArray(input.keys) ||
      input.keys.length > 30 ||
      input.keys.some(
        (key: unknown) =>
          typeof key !== "string" || key.length < 4 || key.length > 130,
      )
    ) {
      return reply({ error: "INVALID_REQUEST" }, 400);
    }
    const available = await load(role, access.organizationId, access.userId);
    const allowed = new Set(available.map((item) => item.key));
    const keys = [...new Set(input.keys as string[])];
    if (keys.some((key) => !allowed.has(key))) {
      return reply({ error: "EVENT_NOT_ACCESSIBLE" }, 403);
    }
    if (keys.length) {
      await db().query(
        `INSERT INTO workspace_notification_reads (user_id, organization_id, event_key)
         SELECT $1, $2, unnest($3::text[])
         ON CONFLICT (user_id, organization_id, event_key) DO NOTHING`,
        [access.userId, access.organizationId, keys],
      );
    }
    return reply({ marked: keys.length });
  } catch (error) {
    if (error instanceof SyntaxError)
      return reply({ error: "INVALID_JSON" }, 400);
    return reply({ error: "NOTIFICATIONS_UNAVAILABLE" }, 503);
  }
}
