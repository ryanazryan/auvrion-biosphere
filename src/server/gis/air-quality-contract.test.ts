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
  it("uses only an upstream hourly US AQI no older than two hours when current index is null", () => {
    const result = parseModelAirQuality(
      {
        current: {
          time: "2026-10-28T10:00",
          us_aqi: null,
          pm2_5: 45,
          pm10: 78,
        },
        hourly: {
          time: ["2026-10-28T07:00", "2026-10-28T09:00", "2026-10-28T11:00"],
          us_aqi: [80, 115, 160],
        },
      },
      city,
    )[0];
    expect(result).toMatchObject({
      usAqi: 115,
      aqiTimeUtc: "2026-10-28T09:00Z",
      pm25: 45,
    });
  });
  it("does not use stale or future hourly AQI or calculate AQI from particulate values", () => {
    const result = parseModelAirQuality(
      {
        current: {
          time: "2026-10-28T10:00",
          us_aqi: null,
          pm2_5: 100,
          pm10: 150,
        },
        hourly: {
          time: ["2026-10-28T07:00", "2026-10-28T11:00"],
          us_aqi: [200, 220],
        },
      },
      city,
    )[0];
    expect(result).toMatchObject({
      usAqi: null,
      aqiTimeUtc: null,
      pm25: 100,
      pm10: 150,
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
