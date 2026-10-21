/** AB-WC-012 owner-approved V1 Case edges; no Task transitions are approved. */
export const APPROVED_CASE_EDGES = {
  "AB-TR-010": { actor: "operator", from: "received", to: "under_review" },
  "AB-TR-011": {
    actor: "operator",
    from: "under_review",
    to: "awaiting_decision",
  },
  "AB-TR-012": {
    actor: "supervisor",
    from: "awaiting_decision",
    to: "monitoring",
  },
  "AB-TR-013": {
    actor: "supervisor",
    from: "awaiting_decision",
    to: "assigned",
  },
} as const;

export type ApprovedCaseTransitionId = keyof typeof APPROVED_CASE_EDGES;
export type CaseAssignment = {
  rangerUserId: string;
  zoneId: string;
  title: string;
  instructions: string;
  safetyNotes: string;
};
export type CaseTransitionCommand = {
  organizationId: string;
  caseId: string;
  requestId: string;
  transitionId: ApprovedCaseTransitionId;
  expectedVersion: number;
  reason: string;
  assignment?: CaseAssignment;
};

export class WorkflowFailure extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
    public readonly code: string,
  ) {
    super(code);
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}
function filled(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= min &&
    value.trim().length <= max &&
    Array.from(value).every((character) => {
      const code = character.charCodeAt(0);

      return code >= 32 || code === 9 || code === 10 || code === 13;
    })
  );
}

/** Validate all untrusted data before entering an authorization or DB boundary. */
export function parseCaseTransitionCommand(
  raw: unknown,
): CaseTransitionCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new WorkflowFailure(400, "INVALID_WORKFLOW_REQUEST");
  }
  const input = raw as Record<string, unknown>;
  if (
    !isUuid(input.organizationId) ||
    !isUuid(input.caseId) ||
    !isUuid(input.requestId) ||
    !Number.isSafeInteger(input.expectedVersion) ||
    (input.expectedVersion as number) < 1 ||
    !filled(input.reason, 10, 2000)
  ) {
    throw new WorkflowFailure(400, "INVALID_WORKFLOW_REQUEST");
  }
  // Use own-property membership: callers cannot register additional edges.
  if (
    typeof input.transitionId !== "string" ||
    !Object.hasOwn(APPROVED_CASE_EDGES, input.transitionId)
  ) {
    throw new WorkflowFailure(403, "TRANSITION_NOT_APPROVED");
  }
  const transitionId = input.transitionId as ApprovedCaseTransitionId;
  const isAssign = transitionId === "AB-TR-013";
  if (!isAssign && input.assignment !== undefined) {
    throw new WorkflowFailure(422, "ASSIGNMENT_NOT_APPLICABLE");
  }
  let assignment: CaseAssignment | undefined;
  if (isAssign) {
    if (
      !input.assignment ||
      typeof input.assignment !== "object" ||
      Array.isArray(input.assignment)
    ) {
      throw new WorkflowFailure(422, "ASSIGNMENT_REQUIRED");
    }
    const a = input.assignment as Record<string, unknown>;
    if (
      !filled(a.rangerUserId, 1, 200) ||
      !isUuid(a.zoneId) ||
      !filled(a.title, 5, 160) ||
      !filled(a.instructions, 10, 2000) ||
      !filled(a.safetyNotes, 10, 2000)
    ) {
      throw new WorkflowFailure(422, "INVALID_ASSIGNMENT");
    }
    assignment = {
      rangerUserId: (a.rangerUserId as string).trim(),
      zoneId: a.zoneId as string,
      title: (a.title as string).trim(),
      instructions: (a.instructions as string).trim(),
      safetyNotes: (a.safetyNotes as string).trim(),
    };
  }
  return {
    organizationId: input.organizationId,
    caseId: input.caseId,
    requestId: input.requestId,
    transitionId,
    expectedVersion: input.expectedVersion as number,
    reason: (input.reason as string).trim(),
    ...(assignment ? { assignment } : {}),
  };
}
