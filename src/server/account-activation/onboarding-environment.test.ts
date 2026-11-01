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

  it("accepts HTTPS origin via a correctly configured Caddy reverse proxy", () => {
    const request = new Request("http://app:3000/api/access-applications", {
      method: "POST",
      headers: {
        origin: "https://auvrionbiosphere.com",
        host: "auvrionbiosphere.com",
        "x-forwarded-host": "auvrionbiosphere.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(
      isAllowedOnboardingOrigin(request, {
        NODE_ENV: "production",
        ENABLE_PRODUCTION_ONBOARDING: "YES",
        BETTER_AUTH_URL: "https://auvrionbiosphere.com",
      }),
    ).toBe(true);
  });

  it("rejects an internal proxy request with untrusted forwarded host", () => {
    const request = new Request("http://app:3000/api/access-applications", {
      method: "POST",
      headers: {
        origin: "https://auvrionbiosphere.com",
        host: "auvrionbiosphere.com",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(
      isAllowedOnboardingOrigin(request, {
        NODE_ENV: "production",
        ENABLE_PRODUCTION_ONBOARDING: "YES",
        BETTER_AUTH_URL: "https://auvrionbiosphere.com",
      }),
    ).toBe(false);
  });

  it("rejects an internal proxy request without HTTPS forwarding", () => {
    const request = new Request("http://app:3000/api/access-applications", {
      method: "POST",
      headers: {
        origin: "https://auvrionbiosphere.com",
        host: "auvrionbiosphere.com",
        "x-forwarded-host": "auvrionbiosphere.com",
        "x-forwarded-proto": "http",
      },
    });
    expect(
      isAllowedOnboardingOrigin(request, {
        NODE_ENV: "production",
        ENABLE_PRODUCTION_ONBOARDING: "YES",
        BETTER_AUTH_URL: "https://auvrionbiosphere.com",
      }),
    ).toBe(false);
  });

  it("rejects a foreign Origin even when proxy headers match", () => {
    const request = new Request("http://app:3000/api/access-applications", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        host: "auvrionbiosphere.com",
        "x-forwarded-host": "auvrionbiosphere.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(
      isAllowedOnboardingOrigin(request, {
        NODE_ENV: "production",
        ENABLE_PRODUCTION_ONBOARDING: "YES",
        BETTER_AUTH_URL: "https://auvrionbiosphere.com",
      }),
    ).toBe(false);
  });
});
