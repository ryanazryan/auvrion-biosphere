import { describe, expect, it } from "vitest";
import { observationCell } from "./observation-cell";

describe("observation-local reference grids", () => {
  it("uses the coarse cell containing Karimata coordinates", () => {
    expect(observationCell(-1.618, 108.913)).toEqual([108, -2, 109, -1]);
  });
  it("rejects invalid locations", () => {
    expect(() => observationCell(91, 115)).toThrow("INVALID_OBSERVATION_POINT");
  });
});
