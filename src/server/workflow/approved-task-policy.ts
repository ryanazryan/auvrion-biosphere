/** AB-WC-013 — owner-approved Task workflow, with server-side deny-by-default. */
export const APPROVED_TASK_EDGES = {
  "AB-TR-024": { actor: "ranger", from: "assigned", to: "accepted" },
  "AB-TR-025": { actor: "ranger", from: "accepted", to: "in_progress" },
  "AB-TR-026": { actor: "ranger", from: "in_progress", to: "blocked" },
  "AB-TR-027": { actor: "ranger", from: "blocked", to: "in_progress" },
  "AB-TR-028": { actor: "ranger", from: "in_progress", to: "submitted" },
  "AB-TR-029": { actor: "supervisor", from: "submitted", to: "completed" },
  "AB-TR-030": { actor: "supervisor", from: "submitted", to: "in_progress" },
  "AB-TR-031": { actor: "supervisor", from: "assigned", to: "cancelled" },
  "AB-TR-032": { actor: "supervisor", from: "in_progress", to: "cancelled" },
  "AB-TR-033": { actor: "supervisor", from: "blocked", to: "cancelled" },
} as const;

export type TaskTransitionId = keyof typeof APPROVED_TASK_EDGES;
export type TaskActor = "ranger" | "supervisor";

export class TaskWorkflowFailure extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
    public readonly code: string,
  ) {
    super(code);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isTaskWorkflowUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function hasInvalidControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  });
}

export function parseTaskCommand(raw: unknown) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TaskWorkflowFailure(400, "INVALID_TASK_COMMAND");
  }
  const v = raw as Record<string, unknown>;
  if (
    !isTaskWorkflowUuid(v.organizationId) ||
    !isTaskWorkflowUuid(v.taskId) ||
    !isTaskWorkflowUuid(v.requestId) ||
    !Number.isSafeInteger(v.expectedVersion) ||
    (v.expectedVersion as number) < 1 ||
    typeof v.reason !== "string" ||
    v.reason.trim().length < 10 ||
    v.reason.length > 2000 ||
    hasInvalidControlCharacters(v.reason)
  ) {
    throw new TaskWorkflowFailure(400, "INVALID_TASK_COMMAND");
  }
  if (
    typeof v.transitionId !== "string" ||
    !Object.hasOwn(APPROVED_TASK_EDGES, v.transitionId)
  ) {
    throw new TaskWorkflowFailure(403, "TASK_TRANSITION_NOT_APPROVED");
  }
  return {
    organizationId: v.organizationId,
    taskId: v.taskId,
    requestId: v.requestId,
    transitionId: v.transitionId as TaskTransitionId,
    expectedVersion: v.expectedVersion as number,
    reason: v.reason.trim(),
  };
}

export type TaskCommand = ReturnType<typeof parseTaskCommand>;
