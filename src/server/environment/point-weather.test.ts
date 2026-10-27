import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parsePointForecast } from "./point-weather";

describe("coarse point forecast", () => {
  it("rejects missing provider data instead of inventing weather", () => {
    expect(parsePointForecast({}, new Date("2026-10-27T00:00:00Z"))).toBeNull();
  });
  it("picks an upcoming UTC forecast rather than a past observation", () => {
    const value = parsePointForecast(
      {
        hourly: {
          time: ["2026-10-26T23:00", "2026-10-27T01:00"],
          temperature_2m: [25, 29],
          relative_humidity_2m: [88, 73],
          precipitation: [0, 0.2],
          wind_speed_10m: [3, 9],
        },
      },
      new Date("2026-10-27T00:30:00Z"),
    );
    expect(value?.state).toBe("available");
    if (value?.state === "available") {
      expect(value.validAtUtc).toBe("2026-10-27T01:00:00Z");
      expect(value.temperatureC).toBe(29);
    }
  });
});
