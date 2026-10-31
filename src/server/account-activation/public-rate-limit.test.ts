import { describe, expect, it } from "vitest";
import {
  onboardingRules,
  resolveOnboardingClientIp,
} from "./public-rate-limit-policy";

describe("public onboarding abuse budgets", () => {
  const request = (ip: string) =>
    new Request("https://auvrionbiosphere.com/api/access-applications", {
      headers: { "x-real-ip": ip },
    });

  it("requires explicit trusted proxy configuration in production", () => {
    expect(() =>
      resolveOnboardingClientIp(request("192.0.2.42"), {
        NODE_ENV: "production",
      }),
    ).toThrow("ONBOARDING_TRUSTED_PROXY_REQUIRED");
  });

  it("rejects missing and malformed address values", () => {
    const env = {
      NODE_ENV: "production",
      AUVRION_ONBOARDING_TRUST_X_REAL_IP: "YES",
    } as const;
    expect(() => resolveOnboardingClientIp(request("spoofed"), env)).toThrow();
    expect(() => resolveOnboardingClientIp(request(""), env)).toThrow();
  });

  it("accepts real IPv4 and IPv6 only when proxy is trusted", () => {
    const env = {
      NODE_ENV: "production",
      AUVRION_ONBOARDING_TRUST_X_REAL_IP: "YES",
    } as const;
    expect(resolveOnboardingClientIp(request("192.0.2.42"), env)).toBe(
      "192.0.2.42",
    );
    expect(resolveOnboardingClientIp(request("2001:db8::42"), env)).toBe(
      "2001:db8::42",
    );
  });

  it("creates global, per-IP, and case-normalized per-email rules", () => {
    const rules = onboardingRules(
      "verification-email",
      "192.0.2.42",
      "JURY@Example.COM",
    );
    expect(rules).toHaveLength(3);
    expect(rules[0]?.key).toBe("global:verification-email");
    expect(rules[1]?.key).toContain("192.0.2.42");
    expect(rules[2]).toEqual({
      key: "email:verification-email:jury@example.com",
      max: 3,
      seconds: 86400,
    });
  });

  it("still throttles brute force token attempts without an email", () => {
    const rules = onboardingRules("verification-confirm", "192.0.2.42");
    expect(rules).toHaveLength(2);
    expect(rules[1]?.max).toBe(30);
  });
});
