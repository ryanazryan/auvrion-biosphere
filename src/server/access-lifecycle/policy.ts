import {
  isOperationalRole,
  type OperationalRole,
} from "../account-activation/policy";

export const LIFECYCLE_ACTIONS = [
  "set_role",
  "revoke_role",
  "disable_account",
] as const;
export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

export function isLifecycleAction(value: unknown): value is LifecycleAction {
  return LIFECYCLE_ACTIONS.some((action) => action === value);
}

export function isLifecycleReason(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= 10 &&
    value.trim().length <= 500 &&
    Array.from(value).every((char) => {
      const code = char.charCodeAt(0);
      return (
        code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
      );
    })
  );
}

export type LifecyclePlan =
  | {
      ok: true;
      auditAction:
        | "role_granted"
        | "role_changed"
        | "role_revoked"
        | "account_disabled";
      nextRole: OperationalRole | null;
      revokeExisting: boolean;
      disableAccount: boolean;
    }
  | { ok: false; code: string };

/** Pure policy used by the transaction and unit tests. */
export function planLifecycleTransition(input: {
  action: LifecycleAction;
  requestedRole: unknown;
  accessStatus: "pending_activation" | "active" | "disabled";
  activeRoles: readonly OperationalRole[];
}): LifecyclePlan {
  const { action, requestedRole, accessStatus, activeRoles } = input;
  if (accessStatus === "disabled")
    return { ok: false, code: "ACCOUNT_DISABLED" };
  if (action === "disable_account") {
    if (requestedRole !== undefined)
      return { ok: false, code: "UNEXPECTED_ROLE" };
    return {
      ok: true,
      auditAction: "account_disabled",
      nextRole: null,
      revokeExisting: activeRoles.length > 0,
      disableAccount: true,
    };
  }
  if (activeRoles.length > 1)
    return { ok: false, code: "MULTIPLE_ACTIVE_ROLES_REVIEW_REQUIRED" };
  const previous = activeRoles[0] ?? null;
  if (action === "set_role") {
    if (!isOperationalRole(requestedRole))
      return { ok: false, code: "INVALID_ROLE" };
    if (previous === requestedRole)
      return { ok: false, code: "ROLE_UNCHANGED" };
    return {
      ok: true,
      auditAction: previous ? "role_changed" : "role_granted",
      nextRole: requestedRole,
      revokeExisting: previous !== null,
      disableAccount: false,
    };
  }
  if (requestedRole !== undefined)
    return { ok: false, code: "UNEXPECTED_ROLE" };
  if (action === "revoke_role") {
    if (!previous) return { ok: false, code: "NO_ACTIVE_ROLE" };
    return {
      ok: true,
      auditAction: "role_revoked",
      nextRole: null,
      revokeExisting: true,
      disableAccount: false,
    };
  }
  return { ok: false, code: "INVALID_ACTION" };
}
