import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getNasaHotspots, isWebgisRegion } from "./nasa-hotspots";

const csv = [
  "latitude,longitude,acq_date,acq_time,confidence,satellite,instrument,frp",
  "-3.5,114.8,2026-10-25,0035,n,N20,VIIRS,8.4",
].join("\n");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("WC011 Stage B3 nationwide FIRMS country source", () => {
  it("accepts Indonesia as a regional selector but rejects arbitrary countries", () => {
    expect(isWebgisRegion("indonesia")).toBe(true);
    expect(isWebgisRegion("world")).toBe(false);
  });

  it("supports a bounded 5-day island query instead of requesting the entire country", async () => {
    vi.stubEnv("AUVRION_FIRMS_MAP_KEY", "B".repeat(32));
    const localCsv = [
      "latitude,longitude,acq_date,acq_time,confidence,satellite,instrument,frp",
      "0.5,101.4,2026-10-25,0035,n,N20,VIIRS,8.4",
    ].join("\n");
    const requested = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(localCsv, { status: 200 }));
    const result = await getNasaHotspots("sumatra", 5);
    expect(result.features).toHaveLength(1);
    expect(result.days).toBe(5);
    expect(String(requested.mock.calls[0]?.[0])).toContain(
      "/VIIRS_NOAA20_NRT/94,-6.8,107.5,6.8/5",
    );
  });

  it("uses the NASA FIRMS country IDN endpoint and retains unverified satellite provenance", async () => {
    vi.stubEnv("AUVRION_FIRMS_MAP_KEY", "A".repeat(32));

    const requested = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(csv, {
        status: 200,
        headers: { "content-type": "text/csv" },
      }),
    );

    const result = await getNasaHotspots("indonesia", 1);
    expect(result.regionLabel).toBe("Indonesia");
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.acquiredAtUtc).toBe(
      "2026-10-25T00:35:00Z",
    );
    expect(result.limitations.join(" ").toLowerCase()).toContain(
      "bukan konfirmasi kebakaran",
    );
    expect(requested).toHaveBeenCalledTimes(1);
    const firstUrl = String(requested.mock.calls[0]?.[0] ?? "");
    expect(firstUrl).toContain("/api/area/csv/");
    expect(firstUrl).toContain("/VIIRS_NOAA20_NRT/94,-11.5,142,7.5/1");
  });
});
