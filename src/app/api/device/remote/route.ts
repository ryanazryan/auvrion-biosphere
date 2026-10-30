import "server-only";
import {
  authenticateDevice,
  parseDeviceIdentity,
  readBoundedJson,
  remotePool,
  remoteReply,
} from "@/server/device-ingestion/listen-remote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ESP32 pulls, never receives inbound connections through NAT. GET also records a heartbeat. */
export async function GET(request: Request): Promise<Response> {
  const identity = parseDeviceIdentity(request);
  if (!identity)
    return remoteReply({ error: "INVALID_DEVICE_CREDENTIAL" }, 401);
  if (new URL(request.url).search)
    return remoteReply({ error: "INVALID_REQUEST" }, 400);
  try {
    if (!(await authenticateDevice(identity.deviceId, identity.token))) {
      return remoteReply({ error: "INVALID_DEVICE_CREDENTIAL" }, 401);
    }
    const runningHeader = request.headers.get("x-listen-monitoring");
    const intervalHeader = request.headers.get("x-listen-interval");
    const monitoring =
      runningHeader === "on" ? true : runningHeader === "off" ? false : null;
    const reportedInterval =
      intervalHeader && /^(60|300|900)$/.test(intervalHeader)
        ? Number(intervalHeader)
        : null;
    if (monitoring === null || reportedInterval === null)
      return remoteReply({ error: "INVALID_STATUS" }, 400);
    const result = await remotePool().query<{
      command_revision: string;
      applied_revision: string;
      desired_action: "start" | "pause" | "interval" | null;
      interval_seconds: number;
    }>(
      `INSERT INTO listen_remote_controls
         (device_id, organization_id, last_seen_at, reported_monitoring, reported_interval_seconds)
       SELECT d.id, d.organization_id, now(), $2, $3
         FROM ingestion_devices d JOIN observation_sources s
           ON s.id = d.source_id AND s.organization_id = d.organization_id
        WHERE d.id=$1 AND d.status='active' AND s.kind='listen_device' AND s.is_active=true
       ON CONFLICT (device_id) DO UPDATE SET
         last_seen_at=now(),
         reported_monitoring=EXCLUDED.reported_monitoring,
         reported_interval_seconds=EXCLUDED.reported_interval_seconds
       RETURNING command_revision, applied_revision, desired_action, interval_seconds`,
      [identity.deviceId, monitoring, reportedInterval],
    );
    const row = result.rows[0];
    if (!row) return remoteReply({ error: "DEVICE_NOT_FOUND" }, 404);
    const pending = Number(row.command_revision) > Number(row.applied_revision);
    return remoteReply({
      protocolVersion: 1,
      status: "ok",
      deviceId: identity.deviceId,
      command: pending
        ? {
            revision: Number(row.command_revision),
            action: row.desired_action,
            intervalSeconds: row.interval_seconds,
          }
        : null,
    });
  } catch {
    return remoteReply({ error: "REMOTE_UNAVAILABLE" }, 503);
  }
}

/** Device ACK only after NVS configuration is durably committed. */
export async function POST(request: Request): Promise<Response> {
  const identity = parseDeviceIdentity(request);
  if (!identity)
    return remoteReply({ error: "INVALID_DEVICE_CREDENTIAL" }, 401);
  const body = await readBoundedJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body))
    return remoteReply({ error: "INVALID_REQUEST" }, 400);
  const data = body as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (k) => !["revision", "monitoring", "intervalSeconds"].includes(k),
    ) ||
    typeof data.revision !== "number" ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 1 ||
    typeof data.monitoring !== "boolean" ||
    typeof data.intervalSeconds !== "number" ||
    ![60, 300, 900].includes(data.intervalSeconds)
  ) {
    return remoteReply({ error: "INVALID_REQUEST" }, 400);
  }
  try {
    if (!(await authenticateDevice(identity.deviceId, identity.token)))
      return remoteReply({ error: "INVALID_DEVICE_CREDENTIAL" }, 401);
    const result = await remotePool().query(
      `UPDATE listen_remote_controls
          SET applied_revision=$2,
              reported_monitoring=$3,
              reported_interval_seconds=$4,
              last_seen_at=now(), last_ack_at=now()
        WHERE device_id=$1 AND command_revision=$2
        RETURNING device_id`,
      [identity.deviceId, data.revision, data.monitoring, data.intervalSeconds],
    );
    if (!result.rowCount) return remoteReply({ error: "STALE_COMMAND" }, 409);
    return remoteReply({
      protocolVersion: 1,
      status: "acknowledged",
      revision: data.revision,
    });
  } catch {
    return remoteReply({ error: "REMOTE_UNAVAILABLE" }, 503);
  }
}
