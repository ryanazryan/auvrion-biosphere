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
