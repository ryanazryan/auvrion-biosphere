import { createHash, randomBytes } from "node:crypto";
import { ACTIVATION_TTL_MINUTES } from "./policy";
export function isActivationToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
export function hashActivationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
export function issueActivationToken(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashActivationToken(token),
    expiresAt: new Date(now.getTime() + ACTIVATION_TTL_MINUTES * 60_000),
  };
}
