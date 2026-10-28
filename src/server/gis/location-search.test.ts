import { describe, expect, it } from "vitest";
import { parsePhotonPlaces, validPlaceQuery } from "./location-search";

describe("WebGIS place search constraints", () => {
  it("rejects short, long and parameter-like queries", () => {
    expect(validPlaceQuery("Pa")).toBeNull();
    expect(validPlaceQuery("a".repeat(76))).toBeNull();
    expect(validPlaceQuery("a&key=private")).toBeNull();
    expect(validPlaceQuery("Palangka   Raya")).toBe("Palangka Raya");
  });
  it("accepts Indonesian place results but never trusts unbounded or foreign coordinates", () => {
    const features = [
      {
        geometry: { type: "Point", coordinates: [113.921, -2.21] },
        properties: {
          countrycode: "ID",
          name: "Palangka Raya",
          state: "Kalimantan Tengah",
          osm_type: "N",
          osm_id: 123,
        },
      },
      {
        geometry: { type: "Point", coordinates: [13.4, 52.5] },
        properties: { countrycode: "DE", name: "Berlin" },
      },
      {
        geometry: { type: "Point", coordinates: [114.6, -3.4] },
        properties: { countrycode: "MY", name: "Not Indonesia" },
      },
      {
        geometry: { type: "Point", coordinates: [114.6, -3.4] },
        properties: { countrycode: "ID", name: "Banjarmasin" },
      },
    ];
    const value = parsePhotonPlaces({ features });
    expect(value).toHaveLength(2);
    expect(value[0]).toMatchObject({
      label: "Palangka Raya, Kalimantan Tengah",
      longitude: 113.921,
      latitude: -2.21,
    });
    expect(value[1].label).toBe("Banjarmasin");
  });
  it("rejects missing country codes and invalid geometry", () => {
    expect(
      parsePhotonPlaces({
        features: [
          {
            geometry: { type: "Point", coordinates: [114, -2] },
            properties: { name: "Unsafe" },
          },
        ],
      }),
    ).toEqual([]);
    expect(
      parsePhotonPlaces({
        features: [
          {
            geometry: { type: "LineString", coordinates: [114, -2] },
            properties: { countrycode: "ID", name: "Unsafe" },
          },
        ],
      }),
    ).toEqual([]);
  });
});
