import { describe, expect, it } from "vitest";
import type { HotspotPoint } from "@/figma-operator/gis/hotspots";
import { islandBounds, islandHotspots } from "./island-regions";

function point(lon: number, lat: number): HotspotPoint {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      id: "NASA",
      acquiredAtUtc: "2026-10-25T00:00:00Z",
      confidence: "n",
      frpMw: null,
      satellite: "N20",
      instrument: "VIIRS",
    },
  };
}

describe("island viewport presentation", () => {
  it("does not manufacture new detections", () => {
    const points = [point(114, -3), point(111, -7.8), point(136, -4)];
    expect(islandHotspots(points, "indonesia")).toEqual(points);
    expect(islandHotspots(points, "kalimantan")).toEqual([points[0]]);
    expect(islandHotspots(points, "papua")).toEqual([points[2]]);
  });
  it("has a valid extent for each option", () => {
    for (const key of [
      "indonesia",
      "sumatra",
      "jawa",
      "kalimantan",
      "sulawesi",
      "bali_nusatenggara",
      "maluku",
      "papua",
    ] as const) {
      const [w, s, e, n] = islandBounds(key);
      expect(e).toBeGreaterThan(w);
      expect(n).toBeGreaterThan(s);
    }
  });
});
