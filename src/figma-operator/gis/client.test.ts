import { describe, expect, it } from "vitest";
import { approvedPoint, type GisRecord } from "./client";

function row(
  point: GisRecord["location"]["point"],
  hasCoordinates = true,
  disclosure?: GisRecord["location"]["disclosure"],
): GisRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000002",
    source: { id: "00000000-0000-4000-8000-000000000003", code: "TEST" },
    domain: "biodiversity",
    quality: "unreviewed",
    ingestionMode: "historical",
    observedAt: null,
    receivedAt: "2026-10-20T08:00:00.000Z",
    location: { hasCoordinates, unknownReason: null, point, disclosure },
  };
}

describe("AB-WC-011 safe client marker disclosure", () => {
  it("never invents a point when the backend withholds coordinates", () => {
    expect(approvedPoint(row(null))).toBeNull();
  });
  it("never invents a point for unknown location", () => {
    expect(approvedPoint(row(undefined, false))).toBeNull();
  });
  it("does not expose supplied coordinates without explicit disclosure approval", () => {
    const point = {
      type: "Point" as const,
      coordinates: [115.4, -3.4] as [number, number],
    };
    expect(approvedPoint(row(point))).toBeNull();
    expect(
      approvedPoint(row(point, true, "withheld_pending_policy")),
    ).toBeNull();
  });
  it("does not expose an unknown-location record even if approval is mistakenly present", () => {
    const point = {
      type: "Point" as const,
      coordinates: [115.4, -3.4] as [number, number],
    };
    expect(approvedPoint(row(point, false, "approved"))).toBeNull();
  });
  it("rejects invalid longitude and latitude", () => {
    expect(
      approvedPoint(
        row({ type: "Point", coordinates: [182, 2] }, true, "approved"),
      ),
    ).toBeNull();
    expect(
      approvedPoint(
        row({ type: "Point", coordinates: [12, -93] }, true, "approved"),
      ),
    ).toBeNull();
  });
  it("accepts valid coordinates only with explicit backend disclosure approval", () => {
    expect(
      approvedPoint(
        row({ type: "Point", coordinates: [115.4, -3.4] }, true, "approved"),
      ),
    ).toEqual([115.4, -3.4]);
  });
});
