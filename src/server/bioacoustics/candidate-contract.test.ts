import { describe, expect, it } from "vitest";
import { parseBioacousticResult } from "./candidate-contract";

const candidate = {
  label: "Model prediction - unknown species",
  scientificName: null,
  modelScore: 0.42,
  startMs: 0,
  endMs: 3000,
};
const result = {
  status: "succeeded",
  verification: "unverified",
  provider: "test-adapter",
  modelId: "test-classifier",
  modelVersion: "0.1",
  candidates: [candidate],
};

describe("WC-023 bioacoustics candidate contract (no inference)", () => {
  it("accepts explicit unverified candidates", () => {
    expect(parseBioacousticResult(result)).toEqual(result);
  });
  it("accepts a genuine empty-candidate result", () => {
    const v = { ...result, status: "no_candidates", candidates: [] };
    expect(parseBioacousticResult(v)).toEqual(v);
  });
  it.each(["verified", "confirmed", "valid"])(
    "rejects fabricated verification %s",
    (verification) => {
      expect(parseBioacousticResult({ ...result, verification })).toBeNull();
    },
  );
  it.each([-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects model score %s",
    (modelScore) => {
      expect(
        parseBioacousticResult({
          ...result,
          candidates: [{ ...candidate, modelScore }],
        }),
      ).toBeNull();
    },
  );
  it("rejects invented scientific names in unexpected schema keys", () => {
    expect(
      parseBioacousticResult({
        ...result,
        candidates: [{ ...candidate, automaticallyConfirmed: true }],
      }),
    ).toBeNull();
  });
  it("rejects out-of-range segment", () => {
    expect(
      parseBioacousticResult({
        ...result,
        candidates: [{ ...candidate, endMs: 40000 }],
      }),
    ).toBeNull();
  });
  it("rejects inverted segment", () => {
    expect(
      parseBioacousticResult({
        ...result,
        candidates: [{ ...candidate, startMs: 4000, endMs: 3000 }],
      }),
    ).toBeNull();
  });
  it("rejects mixed null segment", () => {
    expect(
      parseBioacousticResult({
        ...result,
        candidates: [{ ...candidate, startMs: null }],
      }),
    ).toBeNull();
  });
  it("rejects nonempty candidates with no_candidates status", () => {
    expect(
      parseBioacousticResult({ ...result, status: "no_candidates" }),
    ).toBeNull();
  });
  it("rejects empty succeeded result", () => {
    expect(parseBioacousticResult({ ...result, candidates: [] })).toBeNull();
  });
  it("rejects unknown top-level fields", () => {
    expect(parseBioacousticResult({ ...result, fireAlert: true })).toBeNull();
  });
  it("rejects missing model identity", () => {
    expect(parseBioacousticResult({ ...result, modelVersion: "" })).toBeNull();
  });
});
