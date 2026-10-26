import { describe, expect, it } from "vitest";
import {
  formatBrightness,
  formatConfidence,
  formatFrp,
  frpBand,
} from "./thermal-display";

describe("FIRMS visual-only FRP display", () => {
  it("maps clearly declared UI bands without calling them verified fires", () => {
    expect(frpBand(null)).toBe("unavailable");
    expect(frpBand(0)).toBe("low");
    expect(frpBand(4.99)).toBe("low");
    expect(frpBand(5)).toBe("medium");
    expect(frpBand(19.99)).toBe("medium");
    expect(frpBand(20)).toBe("high");
    expect(frpBand(-1)).toBe("unavailable");
    expect(frpBand("20")).toBe("unavailable");
    expect(frpBand(Number.NaN)).toBe("unavailable");
  });
  it("does not fabricate unavailable FRP or channel brightness", () => {
    expect(formatFrp(null)).toBe("Tidak tersedia");
    expect(formatBrightness(undefined)).toBe("Tidak tersedia");
    expect(formatBrightness("343")).toBe("Tidak tersedia");
    expect(formatBrightness(343)).toContain("K");
    expect(formatBrightness(343)).toContain("radiasi");
  });
  it("labels confidence as NASA detection confidence not fire confirmation", () => {
    expect(formatConfidence("h")).toContain("kelas deteksi NASA");
    expect(formatConfidence("not-a-code")).toBe("Tidak tersedia");
  });
});
