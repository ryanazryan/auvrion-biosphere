/** Only local-dev password recovery is in scope for the WC-012 demo. */
export function localPasswordRecoveryEnabled(env: {
  NODE_ENV?: string;
  ENABLE_LOCAL_ACCESS_REQUESTS?: string;
}): boolean {
  return (
    env.NODE_ENV === "development" && env.ENABLE_LOCAL_ACCESS_REQUESTS === "YES"
  );
}

export function passwordRecoveryEnabled(env: {
  NODE_ENV?: string;
  ENABLE_LOCAL_ACCESS_REQUESTS?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  BETTER_AUTH_URL?: string;
}): boolean {
  if (localPasswordRecoveryEnabled(env)) return true;

  if (
    env.NODE_ENV !== "production" ||
    !env.RESEND_API_KEY ||
    env.RESEND_FROM_EMAIL !== "no-reply@auvrionbiosphere.com"
  ) {
    return false;
  }

  try {
    const url = new URL(env.BETTER_AUTH_URL ?? "");
    return (
      url.protocol === "https:" &&
      url.hostname === "auvrionbiosphere.com" &&
      url.port === ""
    );
  } catch {
    return false;
  }
}

export const PASSWORD_RESET_OTP_LENGTH = 8;
export const PASSWORD_RESET_OTP_TTL_SECONDS = 300;
export const PASSWORD_RESET_OTP_ATTEMPTS = 3;

export function passwordResetEligibleInput(input: unknown): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return false;
  const candidate = input as Record<string, unknown>;
  return (
    typeof candidate.email === "string" &&
    candidate.email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email.trim())
  );
}

export function passwordResetStrongPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 128 &&
    value.trim().length >= 16
  );
}

/** Guard all Email OTP plugin endpoints, allowing ONLY the two reset routes. */
export function isAllowedPasswordRecoveryEndpoint(path: string): boolean {
  return (
    path === "/email-otp/request-password-reset" ||
    path === "/email-otp/reset-password"
  );
}

export function isEmailOtpPluginEndpoint(path: string): boolean {
  return (
    path.startsWith("/email-otp/") ||
    path === "/sign-in/email-otp" ||
    path === "/forget-password/email-otp"
  );
}
