import { describe, expect, it } from "vitest";
import {
  isAllowedOnboardingOrigin,
  onboardingEnabled,
} from "./onboarding-environment";

describe("onboarding environment policy", () => {
  it("denies production by default", () => {
    expect(
      onboardingEnabled({
        NODE_ENV: "production",
        BETTER_AUTH_URL: "https://auvrionbiosphere.com",
      }),
    ).toBe(false);
  });

  it("requires explicit production authorization", () => {
    expect(
      onboardingEnabled({
        NODE_ENV: "production",
        ENABLE_PRODUCTION_ONBOARDING: "YES",
      }),
    ).toBe(true);
  });

  it("rejects foreign origins", () => {
    const request = new Request(
      "https://auvrionbiosphere.com/api/account/activation/complete",
      {
        method: "POST",
        headers: {
          origin: "https://example.com",
        },
      },
    );

    expect(
      isAllowedOnboardingOrigin(request, {
        NODE_ENV: "production",
        ENABLE_PRODUCTION_ONBOARDING: "YES",
        BETTER_AUTH_URL: "https://auvrionbiosphere.com",
      }),
    ).toBe(false);
  });

  it("accepts the exact configured HTTPS origin", () => {
    const request = new Request(
      "https://auvrionbiosphere.com/api/account/activation/complete",
      {
        method: "POST",
        headers: {
          origin: "https://auvrionbiosphere.com",
        },
      },
    );

    expect(
      isAllowedOnboardingOrigin(request, {
        NODE_ENV: "production",
        ENABLE_PRODUCTION_ONBOARDING: "YES",
        BETTER_AUTH_URL: "https://auvrionbiosphere.com",
      }),
    ).toBe(true);
  });
});
