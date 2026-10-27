import { describe, expect, it } from "vitest";
import {
  RECORDING_PAGE_SIZE,
  type RecordingSource,
  recordingPage,
} from "./recording-list-model";

const make = (
  kind: RecordingSource["kind"],
  index: number,
): RecordingSource => ({
  kind,
  id: `record-${kind}-${index}`,
  byteLength: 1024 * index,
  sha256: "a".repeat(64),
  recordedAt: `2026-10-${String(Math.min(28, index + 1)).padStart(2, "0")}T00:00:00Z`,
});

describe("bounded LISTEN recording list", () => {
  const sources = [
    ...Array.from({ length: 18 }, (_, i) => make("human_uploaded_audio", i)),
    ...Array.from({ length: 3 }, (_, i) => make("device_recording", i)),
  ];
  it("prioritizes actual IoT receipts and limits each page", () => {
    const view = recordingPage(sources, "all", 1);
    expect(view.total).toBe(21);
    expect(view.items).toHaveLength(RECORDING_PAGE_SIZE);
    expect(view.pages).toBe(4);
    expect(
      view.items.slice(0, 3).every((v) => v.kind === "device_recording"),
    ).toBe(true);
  });
  it("filters device and manually uploaded audio independently", () => {
    expect(recordingPage(sources, "device", 1).total).toBe(3);
    expect(recordingPage(sources, "manual", 1).total).toBe(18);
    expect(recordingPage(sources, "manual", 2).items).toHaveLength(6);
  });
  it("never escapes the available bounded result set", () => {
    expect(recordingPage(sources, "device", 999).page).toBe(1);
    expect(recordingPage([], "all", 1).items).toEqual([]);
    expect(recordingPage(sources, "all", -5).page).toBe(1);
  });
  it("does not modify the API response order", () => {
    const copy = [...sources];
    recordingPage(sources, "all", 1);
    expect(sources).toEqual(copy);
  });
});
