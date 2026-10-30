import { describe, expect, it } from "vitest";
import {
  caseHandlingStatus,
  neutralizeSpreadsheetValue,
  witaReportRange,
} from "./report-utils";

describe("WITA report date selection", () => {
  it("converts October 2026 boundaries to UTC without server local time", () => {
    const range = witaReportRange(2026, "month", 10);
    expect(range.start.toISOString()).toBe("2026-09-30T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(range.label).toBe("10-2026");
  });
  it("handles the annual boundary correctly", () => {
    const range = witaReportRange(2026, "year", 1);
    expect(range.start.toISOString()).toBe("2025-12-31T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });
});

describe("case handling and safe spreadsheet strings", () => {
  it("does not classify uncased observations as reviewed", () => {
    expect(caseHandlingStatus(null, null)).toBe("Belum dibuat Case");
    expect(caseHandlingStatus("case-id", "awaiting_decision")).toBe(
      "Menunggu keputusan",
    );
  });
  it("neutralizes user-supplied formula prefixes", () => {
    expect(neutralizeSpreadsheetValue("=2+2")).toBe("'=2+2");
    expect(neutralizeSpreadsheetValue(" normal title")).toBe(" normal title");
  });
});
