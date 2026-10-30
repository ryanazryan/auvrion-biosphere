import "server-only";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import {
  DEVICE_UUID,
  readBoundedJson,
  remotePool,
  remoteReply,
  trustedBrowserOrigin,
} from "@/server/device-ingestion/listen-remote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Scope = { organizationId: string; deviceId: string };
function parseScope(input: URLSearchParams): Scope | null {
  const organizationId = input.get("organizationId");
  const deviceId = input.get("deviceId");
  if (
    !organizationId ||
    !deviceId ||
    !DEVICE_UUID.test(organizationId) ||
    !DEVICE_UUID.test(deviceId) ||
    input.size !== 2 ||
    input.getAll("organizationId").length !== 1 ||
    input.getAll("deviceId").length !== 1
  )
    return null;
  return { organizationId, deviceId };
}
async function granted(scope: Scope) {
  return checkOperationalAccess(scope.organizationId, "operator");
}

export async function GET(request: Request): Promise<Response> {
  const scope = parseScope(new URL(request.url).searchParams);
  if (!scope) return remoteReply({ error: "INVALID_REQUEST" }, 400);
  const access = await granted(scope);
  if (!access.allowed)
    return remoteReply({ error: access.reason }, access.status);
  try {
    const result = await remotePool().query<{
      command_revision: string | null;
      applied_revision: string | null;
      desired_action: string | null;
      interval_seconds: number | null;
      reported_monitoring: boolean | null;
      reported_interval_seconds: number | null;
      last_seen_at: Date | null;
      last_ack_at: Date | null;
    }>(
      `SELECT c.command_revision, c.applied_revision, c.desired_action,
              c.interval_seconds, c.reported_monitoring, c.reported_interval_seconds,
              c.last_seen_at, c.last_ack_at
         FROM ingestion_devices d JOIN observation_sources s
           ON s.id=d.source_id AND s.organization_id=d.organization_id
         LEFT JOIN listen_remote_controls c ON c.device_id=d.id AND c.organization_id=d.organization_id
        WHERE d.id=$1 AND d.organization_id=$2 AND d.status='active'
          AND s.kind='listen_device' AND s.is_active=true`,
      [scope.deviceId, scope.organizationId],
    );
    const row = result.rows[0];
    if (!row) return remoteReply({ error: "DEVICE_NOT_FOUND" }, 404);
    const commandRevision = Number(row.command_revision ?? 0);
    const appliedRevision = Number(row.applied_revision ?? 0);
    return remoteReply({
      deviceId: scope.deviceId,
      pending: commandRevision > appliedRevision,
      commandRevision,
      appliedRevision,
      desiredAction: row.desired_action,
      intervalSeconds: row.interval_seconds ?? 300,
      reportedMonitoring: row.reported_monitoring,
      reportedIntervalSeconds: row.reported_interval_seconds,
      lastSeenAt: row.last_seen_at?.toISOString() ?? null,
      lastAcknowledgedAt: row.last_ack_at?.toISOString() ?? null,
    });
  } catch {
    return remoteReply({ error: "REMOTE_STATUS_UNAVAILABLE" }, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!trustedBrowserOrigin(request))
    return remoteReply({ error: "INVALID_ORIGIN" }, 403);
  const body = await readBoundedJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body))
    return remoteReply({ error: "INVALID_REQUEST" }, 400);
  const data = body as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (k) =>
        !["organizationId", "deviceId", "action", "intervalSeconds"].includes(
          k,
        ),
    ) ||
    typeof data.organizationId !== "string" ||
    !DEVICE_UUID.test(data.organizationId) ||
    typeof data.deviceId !== "string" ||
    !DEVICE_UUID.test(data.deviceId) ||
    !["start", "pause", "interval"].includes(String(data.action)) ||
    typeof data.intervalSeconds !== "number" ||
    ![60, 300, 900].includes(data.intervalSeconds)
  )
    return remoteReply({ error: "INVALID_REQUEST" }, 400);
  const scope = {
    organizationId: data.organizationId,
    deviceId: data.deviceId,
  };
  const access = await granted(scope);
  if (!access.allowed)
    return remoteReply({ error: access.reason }, access.status);
  try {
    const result = await remotePool().query<{ command_revision: string }>(
      `INSERT INTO listen_remote_controls
         (device_id, organization_id, command_revision, desired_action, interval_seconds)
       SELECT d.id, d.organization_id, 1, $3, $4
         FROM ingestion_devices d JOIN observation_sources s
           ON s.id=d.source_id AND s.organization_id=d.organization_id
        WHERE d.id=$1 AND d.organization_id=$2 AND d.status='active'
          AND s.kind='listen_device' AND s.is_active=true
       ON CONFLICT (device_id) DO UPDATE
         SET command_revision=listen_remote_controls.command_revision+1,
             desired_action=EXCLUDED.desired_action,
             interval_seconds=EXCLUDED.interval_seconds, updated_at=now()
       RETURNING command_revision`,
      [scope.deviceId, scope.organizationId, data.action, data.intervalSeconds],
    );
    if (!result.rowCount)
      return remoteReply({ error: "DEVICE_NOT_FOUND" }, 404);
    return remoteReply(
      { status: "queued", revision: Number(result.rows[0]?.command_revision) },
      202,
    );
  } catch {
    return remoteReply({ error: "REMOTE_COMMAND_UNAVAILABLE" }, 503);
  }
}
