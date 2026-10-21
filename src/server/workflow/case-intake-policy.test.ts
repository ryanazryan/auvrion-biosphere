import { describe, expect, it } from "vitest";
import { parseCaseIntakeInput } from "./case-intake-policy";

const uuid = "11111111-1111-4111-8111-111111111111";
const valid = {
  organizationId: uuid,
  observationId: "22222222-2222-4222-8222-222222222222",
  title: "Review observasi lingkungan",
  reason: "Validasi manual oleh operator sebelum eskalasi.",
};

describe("WC012 Case intake strict input", () => {
  it("accepts minimum approved human intake fields", () => {
    expect(parseCaseIntakeInput(valid)).toEqual(valid);
  });
  it("rejects a client-controlled status, actor, or transition", () => {
    for (const key of [
      "status",
      "openedByUserId",
      "role",
      "transitionId",
      "version",
      "quality",
    ]) {
      expect(() =>
        parseCaseIntakeInput({ ...valid, [key]: "approved" }),
      ).toThrow("INVALID_CASE_INTAKE");
    }
  });
  it("rejects scope, title and reason errors", () => {
    for (const value of [
      { ...valid, organizationId: "not-uuid" },
      { ...valid, observationId: "not-uuid" },
      { ...valid, reason: "short" },
      { ...valid, title: "x" },
      { ...valid, title: "Good title", reason: "\u0000bad input reason" },
      null,
      [valid],
    ]) {
      expect(() => parseCaseIntakeInput(value)).toThrow("INVALID_CASE_INTAKE");
    }
  });
});
