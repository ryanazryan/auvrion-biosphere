import { describe, expect, it } from "vitest";
import { presentCandidate, rankCandidates, relativeBar } from "./candidates";

const sample = (
  label: string,
  modelScore = 9,
  scientificName: string | null = null,
) => ({
  label,
  modelScore,
  scientificName,
  startMs: null,
  endMs: null,
});
describe("bioacoustic V2 display safety", () => {
  it("keeps Animal generic and not a species", () => {
    const c = presentCandidate(sample("Animal"));
    expect(c.category).toBe("general_animal");
    expect(c.genus).toBeNull();
  });
  it("categorizes Bark as sound event, not taxon", () => {
    expect(presentCandidate(sample("Bark")).category).toBe("sound_event");
  });
  it("recognizes a binomial label without falsely validating a taxonomy source", () => {
    const c = presentCandidate(sample("Strix varia"));
    expect(c.category).toBe("species_candidate");
    expect(c.genus).toBe("Strix");
    expect(c.epithet).toBe("varia");
    expect(c.taxonomySource).toBeNull();
  });
  it("preserves raw scores instead of inventing confidence percentages", () => {
    const ranked = rankCandidates([sample("Bark", 8), sample("Animal", 10)]);
    expect(ranked.map((c) => c.modelScore)).toEqual([10, 8]);
    expect(relativeBar(10, [10, 8])).toBe(100);
    expect(relativeBar(8, [10, 8])).toBe(15);
  });
  it("does not assign a genus to unrecognized labels", () => {
    expect(
      presentCandidate(sample("Domestic_animals_and_pets")).genus,
    ).toBeNull();
  });
});
