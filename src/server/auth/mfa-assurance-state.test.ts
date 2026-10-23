import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { classifyMfaExpiry, mustReauthenticate } from "./mfa-assurance-store";

describe("WC-AUTH: MFA session state", () => {
  const now = Date.parse("2026-10-23T00:00:00Z");
  it("distinguishes missing from expired for enrollment safety", () => {
    expect(classifyMfaExpiry(null, now)).toBe("missing");
  });
  it("accepts only strictly future assurance", () => {
    expect(classifyMfaExpiry(new Date(now + 1000), now)).toBe("valid");
    expect(classifyMfaExpiry(new Date(now), now)).toBe("expired");
    expect(classifyMfaExpiry(new Date(now - 1000), now)).toBe("expired");
  });
  it("reauthenticates only when appropriate", () => {
    expect(mustReauthenticate("expired", "active", true)).toBe(true);
    expect(mustReauthenticate("missing", "active", true)).toBe(true);
    expect(mustReauthenticate("missing", "pending_activation", true)).toBe(
      false,
    );
    expect(mustReauthenticate("missing", "active", false)).toBe(false);
    expect(mustReauthenticate("valid", "active", true)).toBe(false);
  });
});
