/** WC-017 scoped read model: registration/receipts are facts; online presence is unknown. */
import "server-only";
import type { Pool } from "pg";

import {
  type ListenDeviceRow,
  toListenDevice,
} from "./listen-monitor-contract";

export async function listListenDevices(pool: Pool, organizationId: string) {
  const result = await pool.query<ListenDeviceRow>(
    `SELECT d.id, s.code, s.label, d.status, s.is_active AS source_active,
            (SELECT count(*) FROM ingestion_recordings r
              WHERE r.device_id = d.id AND r.organization_id = d.organization_id) AS receipt_count,
            last_receipt.created_at AS last_received_at,
            last_receipt.observation_id AS last_observation_id,
            last_receipt.ingestion_mode AS last_ingestion_mode,
            last_receipt.clock_quality AS last_clock_quality
       FROM ingestion_devices d
       JOIN observation_sources s ON s.id = d.source_id AND s.organization_id = d.organization_id
       LEFT JOIN LATERAL (
         SELECT r.created_at, r.observation_id, r.ingestion_mode, r.clock_quality
           FROM ingestion_recordings r
          WHERE r.device_id = d.id AND r.organization_id = d.organization_id
          ORDER BY r.created_at DESC, r.id DESC LIMIT 1
       ) last_receipt ON true
      WHERE d.organization_id = $1 AND s.kind = 'listen_device'
      ORDER BY s.code ASC, d.id ASC
      LIMIT 51`,
    [organizationId],
  );
  return {
    devices: result.rows.slice(0, 50).map(toListenDevice),
    truncated: result.rows.length > 50,
    checkedAt: new Date().toISOString(),
    connectivityAvailable: false as const,
  };
}
