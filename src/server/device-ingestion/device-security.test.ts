import { describe, expect, it } from "vitest";
import {
  createDeviceToken,
  fingerprintListenRecording,
  hashDeviceToken,
  parseListenMetadata,
  verifyDeviceToken,
} from "./device-security";

const valid = {
  protocolVersion: 1,
  recordingId: "node-01:20261024:000001",
  observedAt: "2026-10-24T01:00:00Z",
  clockQuality: "rtc_verified",
  ingestionMode: "historical",
  audioSha256: "a".repeat(64),
  audioBytes: 4096,
  durationMs: 2000,
} as const;

describe("AB-WC-017 LISTEN device security foundation", () => {
  it("creates random opaque device credentials and verifies only matching hash", () => {
    const token = createDeviceToken();
    const another = createDeviceToken();
    expect(token).not.toBe(another);
    const stored = hashDeviceToken(token);
    expect(stored).not.toContain(token);
    expect(verifyDeviceToken(token, stored)).toBe(true);
    expect(verifyDeviceToken(another, stored)).toBe(false);
    expect(verifyDeviceToken(null, stored)).toBe(false);
    expect(verifyDeviceToken(token, "bad-hash")).toBe(false);
  });

  it("accepts complete bounded LISTEN metadata", () => {
    expect(parseListenMetadata(valid)).toEqual({ ok: true, value: valid });
  });

  it.each([
    [{ ...valid, protocolVersion: 2 }, "UNSUPPORTED_PROTOCOL_VERSION"],
    [{ ...valid, recordingId: "../etc/passwd" }, "INVALID_RECORDING_ID"],
    [
      { ...valid, clockQuality: "rtc_verified", observedAt: null },
      "VERIFIED_CLOCK_REQUIRES_TIMESTAMP",
    ],
    [{ ...valid, observedAt: "not-a-time" }, "INVALID_OBSERVED_AT"],
    [{ ...valid, audioSha256: "invalid" }, "INVALID_AUDIO_HASH"],
    [{ ...valid, audioBytes: 30_000_000 }, "INVALID_AUDIO_SIZE"],
    [{ ...valid, durationMs: 0 }, "INVALID_DURATION"],
    [{ ...valid, danger: true }, "UNKNOWN_METADATA_FIELD"],
  ])("rejects invalid metadata: %s", (input, error) => {
    expect(parseListenMetadata(input)).toEqual({ ok: false, error });
  });

  it("preserves distinct recordings while duplicate payload identity is stable", () => {
    const scope = {
      organizationId: "123e4567-e89b-42d3-a456-426614174000",
      sourceId: "123e4567-e89b-42d3-a456-426614174001",
    };
    const first = fingerprintListenRecording({ ...scope, metadata: valid });
    expect(first).toBe(
      fingerprintListenRecording({ ...scope, metadata: valid }),
    );
    expect(first).not.toBe(
      fingerprintListenRecording({
        ...scope,
        metadata: { ...valid, recordingId: "other" },
      }),
    );
    expect(first).not.toBe(
      fingerprintListenRecording({
        ...scope,
        metadata: { ...valid, audioSha256: "b".repeat(64) },
      }),
    );
  });
});
