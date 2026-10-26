import { describe, expect, it } from "vitest";
import {
  formatEvidenceTime,
  formatMeasurementValue,
  ingestionModeLabel,
  sourceKindLabel,
} from "./observation-evidence-display";

describe("WC026 evidence presentation", () => {
  it("removes numeric scale zeros without rounding away source precision", () => {
    expect(formatMeasurementValue("34.500000")).toBe("34,5");
    expect(formatMeasurementValue("0.000001")).toBe("0,000001");
    expect(formatMeasurementValue("34.000000")).toBe("34");
    expect(formatMeasurementValue("-2.250000")).toBe("-2,25");
    expect(formatMeasurementValue(null)).toBe("—");
  });
  it("formats one UTC instant in all three Indonesian zones", () => {
    const t = "2026-10-26T05:00:00.000Z";
    expect(formatEvidenceTime(t, "WIB")).toContain("12.00 WIB");
    expect(formatEvidenceTime(t, "WITA")).toContain("13.00 WITA");
    expect(formatEvidenceTime(t, "WIT")).toContain("14.00 WIT");
    expect(formatEvidenceTime("bad-date")).toBe("Tidak tersedia");
  });
  it("distinguishes manual/source simulation from device evidence", () => {
    expect(sourceKindLabel("manual")).toContain("manual");
    expect(sourceKindLabel("prevent_device")).toContain("PREVENT");
    expect(ingestionModeLabel("simulation")).toContain("Simulasi");
  });
});
