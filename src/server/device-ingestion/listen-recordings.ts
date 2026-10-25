import "server-only";
import type { Pool } from "pg";
import {
  type ListenRecordingRow,
  toListenRecording,
} from "./listen-recordings-contract";

/** Read-only: records actually committed through WC-017; never queries private media bytes. */
export async function listDeviceRecordings(
  pool: Pool,
  organizationId: string,
  deviceId: string,
) {
  const device = await pool.query<{ id: string }>(
    `SELECT d.id FROM ingestion_devices d
      JOIN observation_sources s ON s.id = d.source_id AND s.organization_id = d.organization_id
      WHERE d.organization_id = $1 AND d.id = $2 AND s.kind = 'listen_device'
      LIMIT 1`,
    [organizationId, deviceId],
  );
  if (device.rowCount !== 1) return null;

  const result = await pool.query<ListenRecordingRow>(
    `SELECT r.id AS receipt_id, r.recording_id, r.observation_id,
            r.created_at AS received_at, r.duration_ms, r.audio_bytes,
            r.ingestion_mode, r.clock_quality, r.declared_observed_at,
            o.quality AS observation_quality
       FROM ingestion_recordings r
       JOIN observations o ON o.id = r.observation_id AND o.organization_id = r.organization_id
      WHERE r.organization_id = $1 AND r.device_id = $2
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 21`,
    [organizationId, deviceId],
  );
  return {
    deviceId,
    recordings: result.rows.slice(0, 20).map(toListenRecording),
    hasMore: result.rows.length > 20,
    checkedAt: new Date().toISOString(),
  };
}
