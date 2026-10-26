/** Organization-scoped WC-017 receipt projection. No private storage keys or coordinates. */
export type ListenRecordingRow = {
  receipt_id: string;
  recording_id: string;
  observation_id: string;
  received_at: Date | string;
  duration_ms: number;
  audio_bytes: string | number;
  ingestion_mode: "live" | "historical" | "simulation";
  clock_quality: "rtc_verified" | "unverified";
  declared_observed_at: string | null;
  observation_quality: "unreviewed" | "valid" | "suspect" | "invalid";
};

export type ListenRecordingSummary = {
  receiptId: string;
  recordingId: string;
  observationId: string;
  receivedAt: string;
  durationMs: number;
  audioBytes: number;
  ingestionMode: ListenRecordingRow["ingestion_mode"];
  clockQuality: ListenRecordingRow["clock_quality"];
  observedAt: string | null;
  observationQuality: ListenRecordingRow["observation_quality"];
};

export function toListenRecording(
  row: ListenRecordingRow,
): ListenRecordingSummary {
  return {
    receiptId: row.receipt_id,
    recordingId: row.recording_id,
    observationId: row.observation_id,
    receivedAt: new Date(row.received_at).toISOString(),
    durationMs: row.duration_ms,
    audioBytes: Number(row.audio_bytes),
    ingestionMode: row.ingestion_mode,
    clockQuality: row.clock_quality,
    // A device-provided clock is not authoritative unless WC-017 verified its RTC.
    observedAt:
      row.clock_quality === "rtc_verified" ? row.declared_observed_at : null,
    observationQuality: row.observation_quality,
  };
}
