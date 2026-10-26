import { describe, expect, it } from "vitest";
import { formatReadableDateTime } from "./format-readable-date";

describe("observasi: format tanggal menurut zona Indonesia", () => {
  it("formats the same UTC instant across three zones", () => {
    expect(formatReadableDateTime("2026-10-26T02:10:00.000Z", "WIB")).toBe(
      "26 Oktober 2026, 09.10 WIB",
    );
    expect(formatReadableDateTime("2026-10-26T02:10:00.000Z", "WITA")).toBe(
      "26 Oktober 2026, 10.10 WITA",
    );
    expect(formatReadableDateTime("2026-10-26T02:10:00.000Z", "WIT")).toBe(
      "26 Oktober 2026, 11.10 WIT",
    );
  });
  it("does not pretend invalid data is a valid date", () => {
    expect(formatReadableDateTime("invalid", "WITA")).toBe("Tidak tersedia");
  });
});
