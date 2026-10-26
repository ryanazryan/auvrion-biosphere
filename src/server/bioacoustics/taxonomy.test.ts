import { describe, expect, it } from "vitest";
import { BINOMIAL, readGbifMatch, readVernaculars } from "./taxonomy";

describe("GBIF taxonomy projection", () => {
  it("accepts a true species-level exact match without treating it as an acoustic identification", () => {
    const value = readGbifMatch("Ardea cinerea", {
      matchType: "EXACT",
      rank: "SPECIES",
      status: "ACCEPTED",
      canonicalName: "Ardea cinerea",
      usageKey: 123,
      kingdom: "Animalia",
      class: "Aves",
      family: "Ardeidae",
      genus: "Ardea",
      species: "Ardea cinerea",
    });
    expect(value?.family).toBe("Ardeidae");
    expect(value?.sourceUrl).toBe("https://www.gbif.org/species/123");
  });
  it("rejects fuzzy and higher-rank matches", () => {
    expect(
      readGbifMatch("Ardea cinerea", {
        matchType: "FUZZY",
        rank: "SPECIES",
        canonicalName: "Ardea cinerea",
        usageKey: 5,
      }),
    ).toBeNull();
    expect(
      readGbifMatch("Ardea cinerea", {
        matchType: "EXACT",
        rank: "GENUS",
        canonicalName: "Ardea cinerea",
        usageKey: 5,
      }),
    ).toBeNull();
  });
  it("does not interpret acoustic event labels as taxa", () => {
    expect(BINOMIAL.test("Animal")).toBe(false);
    expect(BINOMIAL.test("Domestic_animals_and_pets")).toBe(false);
  });
  it("does not fabricate Indonesian vernacular names", () => {
    const values = readVernaculars([
      { vernacularName: "Grey Heron", language: "eng" },
    ]);
    expect(values.commonNameEnglish).toBe("Grey Heron");
    expect(values.commonNameIndonesian).toBeNull();
  });
});
