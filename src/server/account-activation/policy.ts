export const ACTIVATION_TTL_MINUTES = 24 * 60;
export const INVITATION_RESEND_COOLDOWN_SECONDS = 60;
export const OPERATIONAL_ROLES = ["operator", "supervisor", "ranger"] as const;
export type OperationalRole = (typeof OPERATIONAL_ROLES)[number];
export function isOperationalRole(value: unknown): value is OperationalRole {
  return OPERATIONAL_ROLES.some((role) => role === value);
}
export function isActivationPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 128 &&
    value.trim().length >= 16
  );
}
