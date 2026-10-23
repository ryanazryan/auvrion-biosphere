import { describe, expect, it } from "vitest";
import { resolveObservationSourceCode } from "./observation-source";

describe("operator observation source display", () => {
  it("uses resolved source metadata when available", () => {
    expect(resolveObservationSourceCode("SRC-01", "API-01")).toBe("SRC-01");
  });

  it("falls back to observation source code", () => {
    expect(resolveObservationSourceCode(undefined, "API-01")).toBe("API-01");
  });
});
