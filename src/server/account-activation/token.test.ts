import { describe, expect, it } from "vitest";
import { isActivationPassword, isOperationalRole } from "./policy";
import {
  hashActivationToken,
  isActivationToken,
  issueActivationToken,
} from "./token";

describe("account activation proof", () => {
  it("generates 256-bit opaque single-use token material", () => {
    const a = issueActivationToken(new Date("2026-10-18T00:00:00Z"));
    const b = issueActivationToken();
    expect(isActivationToken(a.token)).toBe(true);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toBe(hashActivationToken(a.token));
    expect(a.tokenHash).toHaveLength(64);
    expect(a.expiresAt.toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });
  it("only permits explicit roles and long passwords", () => {
    expect(isOperationalRole("operator")).toBe(true);
    expect(isOperationalRole("admin")).toBe(false);
    expect(isActivationPassword("safe-password-2026!!")).toBe(true);
    expect(isActivationPassword("short")).toBe(false);
    expect(isActivationPassword(" ".repeat(20))).toBe(false);
  });
});
