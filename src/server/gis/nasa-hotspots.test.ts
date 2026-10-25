import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isWebgisDays, isWebgisRegion, parseNasaCsv } from "./nasa-hotspots";

const box = [108, -5, 120, 8] as const;
const head =
  "latitude,longitude,acq_date,acq_time,confidence,satellite,instrument,frp";
describe("WC024 WebGIS FIRMS decoder", () => {
  it("returns valid coordinate/time and does not equate detections with verified fire", () => {
    const parsed = parseNasaCsv(
      `${head}\n-3.5,114.8,2026-10-25,35,n,N20,VIIRS,8.4`,
      box,
    );
    expect(parsed.features).toHaveLength(1);
    expect(parsed.features[0].properties.acquiredAtUtc).toBe(
      "2026-10-25T00:35:00Z",
    );
    expect(parsed.features[0].geometry.coordinates).toEqual([114.8, -3.5]);
  });
  it("rejects latitude outside the selected rectangle", () => {
    const parsed = parseNasaCsv(
      `${head}\n-9,114.8,2026-10-25,23,n,N20,VIIRS,5`,
      box,
    );
    expect(parsed.features).toHaveLength(0);
    expect(parsed.invalidRows).toBe(1);
  });
  it("does not silently accept changed NASA schema", () => {
    expect(() => parseNasaCsv("foo,bar\na,b", box)).toThrow(
      "NASA_SCHEMA_UNAVAILABLE",
    );
  });
  it("allows only approved query selectors", () => {
    expect(isWebgisRegion("kalimantan")).toBe(true);
    expect(isWebgisRegion("localhost")).toBe(false);
    expect(isWebgisDays(5)).toBe(true);
    expect(isWebgisDays(7)).toBe(false);
  });
});
