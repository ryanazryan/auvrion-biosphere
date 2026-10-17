import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const STATUS_LINK_TTL_MINUTES = 15;
export const STATUS_LINK_COOLDOWN_SECONDS = 60;
export const STATUS_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const STATUS_COOKIE_NAME = "ab_applicant_status";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function hashStatusToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createStatusLinkToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashStatusToken(token),
    expiresAt: new Date(Date.now() + STATUS_LINK_TTL_MINUTES * 60_000),
  };
}

export function validStatusLinkToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

function signingKey(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("STATUS_SESSION_SECRET_NOT_CONFIGURED");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey())
    .update("AUVRION_APPLICANT_STATUS_V1:")
    .update(payload)
    .digest("base64url");
}

/** A signed HttpOnly cookie is a short-lived bearer credential, not a role. */
export function createStatusSessionValue(applicationId: string): string {
  if (!UUID.test(applicationId)) throw new Error("INVALID_APPLICATION_ID");
  const expires = Math.floor(Date.now() / 1000) + STATUS_COOKIE_MAX_AGE_SECONDS;
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${applicationId}.${expires}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyStatusSessionValue(
  value: string | undefined,
): string | null {
  if (!value || value.length > 300) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [applicationId, expiry, nonce, signature] = parts;
  if (
    !UUID.test(applicationId) ||
    !/^\d{10}$/.test(expiry) ||
    !/^[A-Za-z0-9_-]{22}$/.test(nonce)
  ) {
    return null;
  }
  const expires = Number(expiry);
  if (
    expires <= Math.floor(Date.now() / 1000) ||
    expires > Math.floor(Date.now() / 1000) + STATUS_COOKIE_MAX_AGE_SECONDS
  )
    return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  try {
    const candidate = Buffer.from(signature);
    const expected = Buffer.from(sign(`${applicationId}.${expiry}.${nonce}`));
    if (
      candidate.length !== expected.length ||
      !timingSafeEqual(candidate, expected)
    )
      return null;
    return applicationId;
  } catch {
    return null;
  }
}

export function statusCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/request-access",
    maxAge: STATUS_COOKIE_MAX_AGE_SECONDS,
  };
}
