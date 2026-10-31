import { describe, expect, it } from "vitest";

import {
  createVerificationToken,
  hashVerificationToken,
  isVerificationTokenFormatValid,
} from "./token";

describe("Access email verification tokens", () => {
  it("generates random tokens", () => {
    const first = createVerificationToken();
    const second = createVerificationToken();

    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).not.toBe(second.tokenHash);
  });

  it("does not store the plaintext token as its hash", () => {
    const result = createVerificationToken();

    expect(result.tokenHash).not.toBe(result.token);
    expect(result.tokenHash).toBe(hashVerificationToken(result.token));
    expect(result.tokenHash).toHaveLength(64);
  });

  it("generates tokens expiring in approximately 24 hours", () => {
    const now = Date.now();
    const result = createVerificationToken();

    const remaining = result.expiresAt.getTime() - now;

    expect(remaining).toBeGreaterThan(24 * 60 * 60_000 - 1000);
    expect(remaining).toBeLessThanOrEqual(24 * 60 * 60_000 + 1000);
  });

  it("rejects malformed tokens", () => {
    expect(isVerificationTokenFormatValid("123456")).toBe(false);
    expect(isVerificationTokenFormatValid(null)).toBe(false);
    expect(isVerificationTokenFormatValid("")).toBe(false);
  });

  it("accepts a generated token format", () => {
    const result = createVerificationToken();

    expect(isVerificationTokenFormatValid(result.token)).toBe(true);
  });
});
