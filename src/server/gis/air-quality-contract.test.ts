import { describe, expect, it } from "vitest";
import {
  parseIndonesiaPoint,
  parseModelAirQuality,
} from "./air-quality-contract";

describe("Air Quality model parser", () => {
  const city = [
    {
      id: "palangka-raya",
      name: "Palangka Raya",
      latitude: -2.21,
      longitude: 113.92,
    },
  ];
  it("parses labelled current model values and UTC timestamp", () => {
    expect(
      parseModelAirQuality(
        {
          current: {
            time: "2026-10-25T09:15",
            us_aqi: 114,
            pm2_5: 36.3,
            pm10: 72,
          },
        },
        city,
      )[0],
    ).toMatchObject({
      usAqi: 114,
      pm25: 36.3,
      pm10: 72,
      modelTimeUtc: "2026-10-25T09:15Z",
    });
  });
  it("does not fabricate missing or malformed model data", () => {
    const value = parseModelAirQuality(
      { current: { time: "unsafe", us_aqi: "77", pm2_5: -5 } },
      city,
    )[0];
    expect(value).toMatchObject({
      usAqi: null,
      pm25: null,
      pm10: null,
      modelTimeUtc: null,
    });
  });
  it("rejects mismatch counts", () => {
    expect(() => parseModelAirQuality([], city)).toThrow(
      "AQI_RESPONSE_COUNT_MISMATCH",
    );
  });
  it("rounds geographic queries to protect precise location", () => {
    expect(parseIndonesiaPoint("-2.21454", "113.92123")).toEqual({
      latitude: -2.2,
      longitude: 113.9,
    });
    expect(parseIndonesiaPoint("40", "-74")).toBeNull();
    expect(parseIndonesiaPoint("NaN", "114")).toBeNull();
  });
});
