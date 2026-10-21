import { describe, expect, it } from "vitest";
import {
  APPROVED_CASE_EDGES,
  parseCaseTransitionCommand,
} from "./approved-case-policy";

const valid = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  caseId: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333",
  expectedVersion: 1,
  transitionId: "AB-TR-010",
  reason: "Metadata and evidence checked before review",
};
const assignment = {
  rangerUserId: "verified-ranger",
  zoneId: "44444444-4444-4444-8444-444444444444",
  title: "Check zone boundary",
  instructions: "Inspect from approved safe access point only",
  safetyNotes: "Do not enter hazardous or restricted locations",
};
function failure(input: unknown, code: string) {
  expect(() => parseCaseTransitionCommand(input)).toThrowError(code);
}

describe("WC-012 approved case policy input boundary", () => {
  it("supports exactly four canonical approved edges", () => {
    expect(Object.keys(APPROVED_CASE_EDGES)).toEqual([
      "AB-TR-010",
      "AB-TR-011",
      "AB-TR-012",
      "AB-TR-013",
    ]);
    for (const id of ["AB-TR-010", "AB-TR-011", "AB-TR-012"]) {
      expect(
        parseCaseTransitionCommand({ ...valid, transitionId: id }).transitionId,
      ).toBe(id);
    }
    expect(
      parseCaseTransitionCommand({
        ...valid,
        transitionId: "AB-TR-013",
        assignment,
      }).assignment,
    ).toEqual(assignment);
  });
  it("denies proposed, unregistered and task transitions", () => {
    for (const id of [
      "AB-TR-014",
      "AB-TR-016",
      "AB-TR-022",
      "AB-TR-024",
      "AB-TR-999",
    ]) {
      failure({ ...valid, transitionId: id }, "TRANSITION_NOT_APPROVED");
    }
  });
  it("rejects missing reasons, invalid version and UUID", () => {
    failure({ ...valid, reason: " " }, "INVALID_WORKFLOW_REQUEST");
    failure({ ...valid, expectedVersion: 0 }, "INVALID_WORKFLOW_REQUEST");
    failure({ ...valid, expectedVersion: 1.2 }, "INVALID_WORKFLOW_REQUEST");
    failure({ ...valid, organizationId: "org-B" }, "INVALID_WORKFLOW_REQUEST");
  });
  it("requires complete assignment and forbids it on other transitions", () => {
    failure({ ...valid, assignment }, "ASSIGNMENT_NOT_APPLICABLE");
    failure({ ...valid, transitionId: "AB-TR-013" }, "ASSIGNMENT_REQUIRED");
    failure(
      {
        ...valid,
        transitionId: "AB-TR-013",
        assignment: { ...assignment, zoneId: "wrong" },
      },
      "INVALID_ASSIGNMENT",
    );
    failure(
      {
        ...valid,
        transitionId: "AB-TR-013",
        assignment: { ...assignment, safetyNotes: " " },
      },
      "INVALID_ASSIGNMENT",
    );
  });
});
