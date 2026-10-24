import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parsePerchWorkerResponse } from "./perch-worker";

const valid = {
  status: "succeeded",
  verification: "unverified",
  provider: "Google",
  modelId: "perch-v2",
  modelVersion: "perch_v2_cpu/1",
  candidates: [
    {
      label: "Isophya lemnotica",
      scientificName: null,
      modelScore: 8.993683,
      startMs: null,
      endMs: null,
    },
  ],
};
describe("WC023 Perch raw-score contract", () => {
  it("preserves uncalibrated scores above 1", () => {
    expect(parsePerchWorkerResponse(valid)?.candidates[0]?.modelScore).toBe(
      8.993683,
    );
  });
  it("rejects injected fields from a compromised worker", () => {
    expect(
      parsePerchWorkerResponse({ ...valid, storageKey: "secret" }),
    ).toBeNull();
    expect(
      parsePerchWorkerResponse({
        ...valid,
        candidates: [{ ...valid.candidates[0], probability: 0.99 }],
      }),
    ).toBeNull();
  });
  it("rejects bogus confidence and invalid timestamps", () => {
    expect(
      parsePerchWorkerResponse({
        ...valid,
        candidates: [{ ...valid.candidates[0], modelScore: Infinity }],
      }),
    ).toBeNull();
    expect(
      parsePerchWorkerResponse({
        ...valid,
        candidates: [{ ...valid.candidates[0], startMs: 0 }],
      }),
    ).toBeNull();
  });
  it("accepts empty no-candidates state", () => {
    expect(
      parsePerchWorkerResponse({
        ...valid,
        status: "no_candidates",
        candidates: [],
      })?.status,
    ).toBe("no_candidates");
  });
});
