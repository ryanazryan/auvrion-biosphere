import { describe, expect, it } from "vitest";
import { parseBmkg, parseBoundingBox, parseFirms } from "./contracts";

describe("WC024 source contracts", () => {
  it("rejects unsafe bbox", () => {
    expect(parseBoundingBox("110,-4,116,-1")).toEqual([110, -4, 116, -1]);
    expect(() => parseBoundingBox("0,-90,180,90")).toThrow();
  });
  it("keeps BMKG UTC and unavailable readings null", () => {
    const d = parseBmkg(
      {
        lokasi: { desa: "Fixture" },
        data: [
          { cuaca: [[{ utc_datetime: "2026-10-25 01:00:00", t: 28, hu: 80 }]] },
        ],
      },
      "31.71.03.1001",
    );
    expect(d.intervals[0]).toMatchObject({
      utc: "2026-10-25T01:00:00.000Z",
      tempC: 28,
      humidityPct: 80,
      windKmh: null,
    });
    expect(() => parseBmkg({ data: [] }, "31.71.03.1001")).toThrow();
  });
  it("counts NASA thermals only inside configured bbox", () => {
    const csv =
      "latitude,longitude,acq_date,acq_time,confidence\n-2,113,2026-10-25,621,n\n-2,99,2026-10-25,621,h";
    const out = parseFirms(csv, [110, -4, 116, -1]);
    expect(out.count).toBe(1);
    expect(out.latestUtc).toBe("2026-10-25T06:21:00.000Z");
    expect(out.confidenceCodes.n).toBe(1);
    expect(
      parseFirms(
        "latitude,longitude,acq_date,acq_time,confidence\n",
        [110, -4, 116, -1],
      ).count,
    ).toBe(0);
  });
});
