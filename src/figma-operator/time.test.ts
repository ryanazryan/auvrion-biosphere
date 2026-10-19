import { describe, expect, it } from "vitest";
import {
  fmtTs,
  isFutureLocalTime,
  isoToZoneLocal,
  zoneFromBrowser,
  zoneLocalToIso,
} from "./time";

describe("AB-WC-009 Indonesian time zones", () => {
  it("converts the same instant to WIB, WITA and WIT", () => {
    const instant = "2026-10-19T15:31:00.000Z";
    expect(isoToZoneLocal(instant, "WIB")).toBe("2026-10-19T22:31");
    expect(isoToZoneLocal(instant, "WITA")).toBe("2026-10-19T23:31");
    expect(isoToZoneLocal(instant, "WIT")).toBe("2026-10-20T00:31");
    expect(fmtTs(instant, "WITA")).toBe("2026-10-19 23:31 WITA");
  });
  it("converts input in WITA to UTC, not WIB", () => {
    expect(zoneLocalToIso("2026-10-19T23:31", "WITA")).toBe(
      "2026-10-19T15:31:00.000Z",
    );
    expect(zoneLocalToIso("2026-10-19T23:31", "WIB")).toBe(
      "2026-10-19T16:31:00.000Z",
    );
  });
  it("compares instants, including the midnight rollover", () => {
    const nowMs = Date.parse("2026-10-19T15:46:00.000Z");
    expect(isFutureLocalTime("2026-10-19T23:31", "WITA", nowMs)).toBe(false);
    expect(isFutureLocalTime("2026-10-19T23:47", "WITA", nowMs)).toBe(true);
    expect(isFutureLocalTime("2026-10-20T00:46", "WIT", nowMs)).toBe(false);
  });
  it("rejects impossible dates instead of silently rolling over", () => {
    expect(() => zoneLocalToIso("2026-02-30T10:10", "WIB")).toThrow(
      "INVALID_LOCAL_DATETIME",
    );
    expect(() => zoneLocalToIso("2026-10-19T25:00", "WITA")).toThrow(
      "INVALID_LOCAL_DATETIME",
    );
  });
  it("recognizes Indonesian device zones", () => {
    expect(zoneFromBrowser("Asia/Pontianak")).toBe("WIB");
    expect(zoneFromBrowser("Asia/Makassar")).toBe("WITA");
    expect(zoneFromBrowser("Asia/Jayapura")).toBe("WIT");
    expect(zoneFromBrowser("Europe/London")).toBeNull();
  });
});
