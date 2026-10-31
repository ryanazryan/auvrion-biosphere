import { createHash, randomBytes } from "node:crypto";

export const EMAIL_VERIFICATION_TTL_MINUTES = 24 * 60;
export const EMAIL_VERIFICATION_RESEND_SECONDS = 60;

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createVerificationToken() {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    tokenHash: hashVerificationToken(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60_000),
  };
}

export function isVerificationTokenFormatValid(
  value: unknown,
): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
