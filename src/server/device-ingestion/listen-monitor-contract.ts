/** Public safe projection of WC-017 receipts. No claim of live connectivity. */
export type ListenDeviceRow = {
  id: string;
  code: string;
  label: string;
  status: "active" | "revoked";
  source_active: boolean;
  receipt_count: string | number;
  last_received_at: Date | string | null;
  last_observation_id: string | null;
  last_ingestion_mode: "live" | "historical" | "simulation" | null;
  last_clock_quality: "rtc_verified" | "unverified" | null;
};

export function toListenDevice(row: ListenDeviceRow) {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    registrationStatus:
      row.status === "revoked"
        ? "revoked"
        : row.source_active
          ? "active"
          : "source_inactive",
    connectivity: "unknown" as const,
    recordingCount: Number(row.receipt_count),
    lastReceivedAt: row.last_received_at
      ? new Date(row.last_received_at).toISOString()
      : null,
    latestObservationId: row.last_observation_id,
    lastIngestionMode: row.last_ingestion_mode,
    lastClockQuality: row.last_clock_quality,
  };
}
