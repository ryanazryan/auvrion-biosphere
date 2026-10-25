import { describe, expect, it } from "vitest";
import { toListenDevice } from "./listen-monitor-contract";

describe("LISTEN monitor read model", () => {
  const base = {
    id: "00000000-0000-4000-8000-000000000001",
    code: "LISTEN-01",
    label: "Recorder 1",
    status: "active" as const,
    source_active: true,
    receipt_count: "3",
    last_received_at: new Date("2026-10-24T12:00:00Z"),
    last_observation_id: "00000000-0000-4000-8000-000000000002",
    last_ingestion_mode: "simulation" as const,
    last_clock_quality: "unverified" as const,
  };
  it("never infers online status from an active registration", () => {
    const value = toListenDevice(base);
    expect(value.connectivity).toBe("unknown");
    expect(value.registrationStatus).toBe("active");
    expect(value.recordingCount).toBe(3);
    expect(value.lastIngestionMode).toBe("simulation");
  });
  it("distinguishes revoked devices and inactive sources", () => {
    expect(
      toListenDevice({ ...base, status: "revoked" }).registrationStatus,
    ).toBe("revoked");
    expect(
      toListenDevice({ ...base, source_active: false }).registrationStatus,
    ).toBe("source_inactive");
  });
});
