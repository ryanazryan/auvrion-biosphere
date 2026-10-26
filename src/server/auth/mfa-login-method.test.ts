import { describe, expect, it } from "vitest";
import { isRecentSensitiveAssuranceMethod } from "./mfa-login-method";

describe("WC025 MFA recovery assurance policy", () => {
  it("permits recent sensitive credential edits only from TOTP", () => {
    expect(isRecentSensitiveAssuranceMethod("totp")).toBe(true);
    expect(isRecentSensitiveAssuranceMethod("recovery")).toBe(false);
    expect(isRecentSensitiveAssuranceMethod("passkey")).toBe(false);
    expect(isRecentSensitiveAssuranceMethod("legacy")).toBe(false);
  });
});
