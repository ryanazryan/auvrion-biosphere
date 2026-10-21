import { describe, expect, it } from "vitest";
import {
  assessProposedTransition,
  CASE_EDGES,
  TASK_EDGES,
  type TransitionIntent,
} from "./transition-contract";

const validCandidate: TransitionIntent = {
  transitionId: "AB-TR-010",
  entity: "Case",
  actor: "Operator",
  fromStatus: "Received",
  expectedVersion: 1,
  currentVersion: 1,
  reason: "Source metadata and review evidence inspected",
};

describe("AB-WC-012 planning contract fails closed", () => {
  it("denies every one of the 24 Proposed canonical transitions", () => {
    for (const [entity, edges] of [
      ["Case", CASE_EDGES],
      ["Task", TASK_EDGES],
    ] as const) {
      for (const [id, actor, from] of edges) {
        expect(
          assessProposedTransition({
            ...validCandidate,
            transitionId: id,
            entity,
            actor,
            fromStatus: from,
          }),
        ).toEqual({ allowed: false, code: "POLICY_NOT_APPROVED" });
      }
    }
  });

  it("rejects nonexistent state-machine edges", () => {
    expect(
      assessProposedTransition({
        ...validCandidate,
        transitionId: "AB-TR-999",
      }),
    ).toEqual({ allowed: false, code: "UNREGISTERED_TRANSITION" });
  });

  it("rejects an actor substitution", () => {
    expect(
      assessProposedTransition({ ...validCandidate, actor: "Supervisor" }),
    ).toEqual({ allowed: false, code: "ENTITY_STATE_ACTOR_MISMATCH" });
  });

  it("rejects a stale version", () => {
    expect(
      assessProposedTransition({ ...validCandidate, expectedVersion: 2 }),
    ).toEqual({ allowed: false, code: "STALE_OR_INVALID_VERSION" });
  });

  it("rejects non-integer versions", () => {
    expect(
      assessProposedTransition({
        ...validCandidate,
        expectedVersion: Number.NaN,
      }),
    ).toEqual({ allowed: false, code: "STALE_OR_INVALID_VERSION" });
  });

  it("rejects empty rationale", () => {
    expect(
      assessProposedTransition({ ...validCandidate, reason: "  " }),
    ).toEqual({ allowed: false, code: "REASON_REQUIRED" });
  });

  it("never grants a write or silently interprets a proposal as approved", () => {
    expect(assessProposedTransition(validCandidate).allowed).toBe(false);
  });
});
