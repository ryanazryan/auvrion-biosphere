import { describe, expect, it } from "vitest";
import { energyRegions } from "./acoustic-activity";

describe("WC-023 acoustic energy regions", () => {
  it("never invents an event from silence", () => {
    expect(energyRegions(Array(100).fill(0), 10)).toEqual([]);
  });
  it("extracts two loud intervals without assigning species names", () => {
    const peaks = Array(100).fill(0.005);
    for (let i = 10; i < 19; i++) peaks[i] = 0.4;
    for (let i = 60; i < 73; i++) peaks[i] = 0.6;
    const found = energyRegions(peaks, 10);
    expect(found.length).toBe(2);
    expect(found[0]?.startSeconds).toBeCloseTo(1);
    expect(found[0]?.endSeconds).toBeCloseTo(1.9);
    expect(found[1]?.startSeconds).toBeCloseTo(6);
  });
  it("rejects malformed duration or empty audio", () => {
    expect(energyRegions([0.5], 0)).toEqual([]);
    expect(energyRegions([], 5)).toEqual([]);
  });
});
