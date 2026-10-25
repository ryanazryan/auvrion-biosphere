import { describe, expect, it } from "vitest";
import {
  type ListenRecordingRow,
  toListenRecording,
} from "./listen-recordings-contract";

const row: ListenRecordingRow = {
  receipt_id: "receipt-1",
  recording_id: "recording-1",
  observation_id: "obs-1",
  received_at: new Date("2026-10-24T12:00:00.000Z"),
  duration_ms: 30000,
  audio_bytes: "960044",
  ingestion_mode: "simulation",
  clock_quality: "unverified",
  declared_observed_at: "2026-10-24T11:45:00.000Z",
  observation_quality: "unreviewed",
};

describe("WC-017 LISTEN receipt projection", () => {
  it("separates server receive time from unverified device time", () => {
    const result = toListenRecording(row);
    expect(result.receivedAt).toBe("2026-10-24T12:00:00.000Z");
    expect(result.observedAt).toBeNull();
    expect(result.ingestionMode).toBe("simulation");
    expect(result.audioBytes).toBe(960044);
  });
  it("exposes verified RTC timestamp without elevating observation quality", () => {
    const result = toListenRecording({ ...row, clock_quality: "rtc_verified" });
    expect(result.observedAt).toBe(row.declared_observed_at);
    expect(result.observationQuality).toBe("unreviewed");
  });
});
