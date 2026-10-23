import { describe, expect, it } from "vitest";
import {
  APPROVED_TASK_EDGES,
  parseTaskCommand,
  TaskWorkflowFailure,
} from "./approved-task-policy";

const uuid = "cf70086a-d62f-4331-8397-59cdf1a57d56";
const base = {
  organizationId: uuid,
  taskId: uuid,
  requestId: uuid,
  expectedVersion: 1,
  reason: "Tindakan lapangan diuji melalui workflow.",
};

describe("AB-WC-013 approved Task policy", () => {
  it("has ten exact edges", () => {
    expect(Object.keys(APPROVED_TASK_EDGES)).toHaveLength(10);
    expect(APPROVED_TASK_EDGES["AB-TR-028"]).toEqual({
      actor: "ranger",
      from: "in_progress",
      to: "submitted",
    });
    expect(APPROVED_TASK_EDGES["AB-TR-029"].actor).toBe("supervisor");
  });
  it("rejects unregistered transitions", () => {
    expect(() =>
      parseTaskCommand({ ...base, transitionId: "AB-TR-999" }),
    ).toThrowError(TaskWorkflowFailure);
  });
  it("rejects stale or missing versions", () => {
    expect(() =>
      parseTaskCommand({
        ...base,
        transitionId: "AB-TR-024",
        expectedVersion: 0,
      }),
    ).toThrowError("INVALID_TASK_COMMAND");
  });
  it("requires reason and UUID idempotency", () => {
    expect(() =>
      parseTaskCommand({ ...base, transitionId: "AB-TR-024", reason: "short" }),
    ).toThrowError("INVALID_TASK_COMMAND");
    expect(() =>
      parseTaskCommand({
        ...base,
        transitionId: "AB-TR-024",
        requestId: "123",
      }),
    ).toThrowError("INVALID_TASK_COMMAND");
  });
  it("accepts documented valid command", () => {
    expect(
      parseTaskCommand({ ...base, transitionId: "AB-TR-024" }).transitionId,
    ).toBe("AB-TR-024");
  });
});

describe("AB-WC-013 Task command regression", () => {
  it.each([null, undefined, [], "invalid", 42, true])(
    "rejects non-object command input: %s",
    (raw) => {
      expect(() => parseTaskCommand(raw)).toThrowError("INVALID_TASK_COMMAND");
    },
  );

  it.each([
    ["organizationId", "invalid"],
    ["taskId", "invalid"],
    ["requestId", "invalid"],
    ["expectedVersion", -1],
    ["expectedVersion", 1.5],
    ["expectedVersion", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects invalid %s", (field, value) => {
    expect(() =>
      parseTaskCommand({
        ...base,
        transitionId: "AB-TR-024",
        [field]: value,
      }),
    ).toThrowError("INVALID_TASK_COMMAND");
  });

  it.each([
    "short",
    " ".repeat(12),
    "a".repeat(2001),
    "Valid reason with a control \u0001 character",
  ])("rejects invalid reason input", (reason) => {
    expect(() =>
      parseTaskCommand({
        ...base,
        transitionId: "AB-TR-024",
        reason,
      }),
    ).toThrowError("INVALID_TASK_COMMAND");
  });

  it("trims reason without mutating approved transition", () => {
    const command = parseTaskCommand({
      ...base,
      transitionId: "AB-TR-024",
      reason: "  Ranger accepted assignment safely.  ",
    });

    expect(command.reason).toBe("Ranger accepted assignment safely.");
    expect(command.transitionId).toBe("AB-TR-024");
  });

  it("covers the documented transition actors and states", () => {
    expect(APPROVED_TASK_EDGES).toEqual({
      "AB-TR-024": {
        actor: "ranger",
        from: "assigned",
        to: "accepted",
      },
      "AB-TR-025": {
        actor: "ranger",
        from: "accepted",
        to: "in_progress",
      },
      "AB-TR-026": {
        actor: "ranger",
        from: "in_progress",
        to: "blocked",
      },
      "AB-TR-027": {
        actor: "ranger",
        from: "blocked",
        to: "in_progress",
      },
      "AB-TR-028": {
        actor: "ranger",
        from: "in_progress",
        to: "submitted",
      },
      "AB-TR-029": {
        actor: "supervisor",
        from: "submitted",
        to: "completed",
      },
      "AB-TR-030": {
        actor: "supervisor",
        from: "submitted",
        to: "in_progress",
      },
      "AB-TR-031": {
        actor: "supervisor",
        from: "assigned",
        to: "cancelled",
      },
      "AB-TR-032": {
        actor: "supervisor",
        from: "in_progress",
        to: "cancelled",
      },
      "AB-TR-033": {
        actor: "supervisor",
        from: "blocked",
        to: "cancelled",
      },
    });
  });
});
