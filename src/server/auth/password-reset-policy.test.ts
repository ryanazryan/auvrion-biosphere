import { describe, expect, it } from "vitest";
import {
  isAllowedPasswordRecoveryEndpoint,
  isEmailOtpPluginEndpoint,
  localPasswordRecoveryEnabled,
  passwordResetEligibleInput,
  passwordResetStrongPassword,
} from "./password-reset-policy";

describe("local-only password recovery policy", () => {
  it("requires explicit development gate", () => {
    expect(
      localPasswordRecoveryEnabled({
        NODE_ENV: "development",
        ENABLE_LOCAL_ACCESS_REQUESTS: "YES",
      }),
    ).toBe(true);
    expect(
      localPasswordRecoveryEnabled({
        NODE_ENV: "production",
        ENABLE_LOCAL_ACCESS_REQUESTS: "YES",
      }),
    ).toBe(false);
    expect(localPasswordRecoveryEnabled({ NODE_ENV: "development" })).toBe(
      false,
    );
  });
  it("permits only two password reset endpoints", () => {
    expect(
      isAllowedPasswordRecoveryEndpoint("/email-otp/request-password-reset"),
    ).toBe(true);
    expect(isAllowedPasswordRecoveryEndpoint("/email-otp/reset-password")).toBe(
      true,
    );
    for (const path of [
      "/sign-in/email-otp",
      "/email-otp/send-verification-otp",
      "/email-otp/verify-email",
      "/email-otp/check-verification-otp",
      "/forget-password/email-otp",
    ]) {
      expect(isEmailOtpPluginEndpoint(path)).toBe(true);
      expect(isAllowedPasswordRecoveryEndpoint(path)).toBe(false);
    }
  });
  it("accepts email but rejects non-email input", () => {
    expect(passwordResetEligibleInput({ email: "someone@example.test" })).toBe(
      true,
    );
    expect(passwordResetEligibleInput({ email: "not-email" })).toBe(false);
    expect(
      passwordResetEligibleInput({ email: `${"a".repeat(255)}@x.test` }),
    ).toBe(false);
  });
  it("enforces password length consistent with activation", () => {
    expect(passwordResetStrongPassword("a".repeat(16))).toBe(true);
    expect(passwordResetStrongPassword("a".repeat(15))).toBe(false);
    expect(passwordResetStrongPassword("a".repeat(129))).toBe(false);
    expect(passwordResetStrongPassword(" ".repeat(16))).toBe(false);
  });
});
