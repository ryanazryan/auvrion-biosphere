/**
 * AB-WC-012 — planning-stage Case/Task transition contract.
 *
 * Source: Notion State Transition Register, AB-TR-010...033 (Proposed).
 * This is a deny-by-default review guard, NOT authorization to mutate.
 * Even a valid candidate cannot execute until the owner approves its policy
 * and a transactional service implements current-state/scope/MFA/version checks.
 */

export type WorkflowActor = "Operator" | "Supervisor" | "Ranger" | "System";
export type WorkflowEntity = "Case" | "Task";

export const CASE_EDGES = [
  ["AB-TR-010", "Operator", "Received", "Under Review"],
  ["AB-TR-011", "Operator", "Under Review", "Awaiting Decision"],
  ["AB-TR-012", "Supervisor", "Awaiting Decision", "Monitoring"],
  ["AB-TR-013", "Supervisor", "Awaiting Decision", "Assigned"],
  ["AB-TR-014", "System", "Assigned", "Field Verification"],
  ["AB-TR-015", "System", "Field Verification", "Awaiting Outcome"],
  ["AB-TR-016", "Supervisor", "Awaiting Outcome", "Closed"],
  ["AB-TR-017", "Supervisor", "Awaiting Outcome", "Assigned"],
  ["AB-TR-018", "Supervisor", "Awaiting Decision", "Escalated"],
  ["AB-TR-019", "Supervisor", "Field Verification", "Escalated"],
  ["AB-TR-020", "Supervisor", "Escalated", "Closed"],
  ["AB-TR-021", "Operator", "Monitoring", "Under Review"],
  ["AB-TR-022", "Supervisor", "Monitoring", "Closed"],
  ["AB-TR-023", "Supervisor", "Closed", "Under Review"],
] as const;

export const TASK_EDGES = [
  ["AB-TR-024", "Ranger", "Assigned", "Accepted"],
  ["AB-TR-025", "Ranger", "Accepted", "In Progress"],
  ["AB-TR-026", "Ranger", "In Progress", "Blocked"],
  ["AB-TR-027", "Ranger", "Blocked", "In Progress"],
  ["AB-TR-028", "Ranger", "In Progress", "Submitted"],
  ["AB-TR-029", "Supervisor", "Submitted", "Completed"],
  ["AB-TR-030", "Supervisor", "Submitted", "In Progress"],
  ["AB-TR-031", "Supervisor", "Assigned", "Cancelled"],
  ["AB-TR-032", "Supervisor", "In Progress", "Cancelled"],
  ["AB-TR-033", "Supervisor", "Blocked", "Cancelled"],
] as const;

export type TransitionIntent = {
  transitionId: string;
  entity: WorkflowEntity;
  actor: WorkflowActor;
  fromStatus: string;
  expectedVersion: number;
  currentVersion: number;
  reason: string;
};

export type TransitionAssessment = {
  allowed: false;
  code:
    | "UNREGISTERED_TRANSITION"
    | "ENTITY_STATE_ACTOR_MISMATCH"
    | "STALE_OR_INVALID_VERSION"
    | "REASON_REQUIRED"
    | "POLICY_NOT_APPROVED";
};

/**
 * Pure review-time preflight, intentionally without a success return path.
 * No caller can turn this into a write permission by supplying client flags.
 * Do not wire to mutation endpoints as a substitute for real authorization.
 */
export function assessProposedTransition(
  intent: TransitionIntent,
): TransitionAssessment {
  const edges = intent.entity === "Case" ? CASE_EDGES : TASK_EDGES;
  const edge = edges.find((candidate) => candidate[0] === intent.transitionId);
  if (!edge) return { allowed: false, code: "UNREGISTERED_TRANSITION" };
  if (edge[1] !== intent.actor || edge[2] !== intent.fromStatus)
    return { allowed: false, code: "ENTITY_STATE_ACTOR_MISMATCH" };
  if (
    !Number.isSafeInteger(intent.currentVersion) ||
    intent.currentVersion < 1 ||
    !Number.isSafeInteger(intent.expectedVersion) ||
    intent.expectedVersion !== intent.currentVersion
  )
    return { allowed: false, code: "STALE_OR_INVALID_VERSION" };
  if (!intent.reason.trim()) return { allowed: false, code: "REASON_REQUIRED" };
  // All these entries remain Proposed in the authoritative Notion register.
  return { allowed: false, code: "POLICY_NOT_APPROVED" };
}
