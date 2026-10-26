import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseNasaCsv } from "./nasa-hotspots";

const bbox = [94, -11.5, 142, 7.5] as const;
const header =
  "latitude,longitude,bright_ti4,bright_ti5,acq_date,acq_time,confidence,satellite,instrument,frp";

describe("NASA FIRMS VIIRS brightness provenance", () => {
  it("retains I4 and I5 Kelvin separately from MW FRP", () => {
    const result = parseNasaCsv(
      `${header}\n-3.4,114.7,343.5,303.3,2026-10-25,1030,n,N20,VIIRS,20.25`,
      bbox,
    );
    expect(result.features).toHaveLength(1);
    const props = result.features[0].properties;
    expect(props.brightnessTi4K).toBe(343.5);
    expect(props.brightnessTi5K).toBe(303.3);
    expect(props.frpMw).toBe(20.25);
    expect(props.acquiredAtUtc).toBe("2026-10-25T10:30:00Z");
  });
  it("remains compatible with older tests/CSV without brightness columns", () => {
    const older =
      "latitude,longitude,acq_date,acq_time,confidence,satellite,instrument,frp\n-3.4,114.7,2026-10-25,1030,n,N20,VIIRS,2";
    const result = parseNasaCsv(older, bbox);
    expect(result.features[0].properties.brightnessTi4K).toBeNull();
    expect(result.features[0].properties.brightnessTi5K).toBeNull();
  });
  it("omits nonsensical brightness instead of inventing a temperature", () => {
    const result = parseNasaCsv(
      `${header}\n-3.4,114.7,NaN,9999,2026-10-25,1030,n,N20,VIIRS,1`,
      bbox,
    );
    expect(result.features[0].properties.brightnessTi4K).toBeNull();
    expect(result.features[0].properties.brightnessTi5K).toBeNull();
  });
});
