import { describe, expect, it } from "vitest";
import {
  isReviewStatus,
  isSignalClass,
  SIGNAL_CLASSES,
  SIGNAL_LABELS,
  validCalibratedProbability,
} from "./signal-taxonomy";

describe("human-advisory signal taxonomy", () => {
  it("accepts only approved classes", () => {
    for (const kind of SIGNAL_CLASSES) {
      expect(isSignalClass(kind)).toBe(true);
      expect(SIGNAL_LABELS[kind].length).toBeGreaterThan(0);
    }
    expect(isSignalClass("illegal_logging_confirmed")).toBe(false);
    expect(isSignalClass("gunshot_detected_with_certainty")).toBe(false);
  });
  it("only allows review status and avoids a crime verdict", () => {
    expect(isReviewStatus("unreviewed")).toBe(true);
    expect(isReviewStatus("corroborated")).toBe(true);
    expect(isReviewStatus("rejected")).toBe(true);
    expect(isReviewStatus("confirmed_illegal_logging")).toBe(false);
  });
  it("rejects uncalibrated raw model scores as probabilities", () => {
    expect(validCalibratedProbability(0)).toBe(true);
    expect(validCalibratedProbability(0.72)).toBe(true);
    expect(validCalibratedProbability(1)).toBe(true);
    expect(validCalibratedProbability(1.2)).toBe(false);
    expect(validCalibratedProbability(NaN)).toBe(false);
  });
});
