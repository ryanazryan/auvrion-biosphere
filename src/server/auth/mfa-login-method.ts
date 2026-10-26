import type { MfaAssuranceMethod } from "@/server/db/mfa-assurance-schema";

/** Sensitive credential operations require TOTP-verified assurance. */
export const RECENT_SENSITIVE_ASSURANCE_METHOD: MfaAssuranceMethod = "totp";

export function isRecentSensitiveAssuranceMethod(
  method: MfaAssuranceMethod,
): boolean {
  return method === RECENT_SENSITIVE_ASSURANCE_METHOD;
}
