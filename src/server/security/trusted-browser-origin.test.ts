import { describe, expect, it } from "vitest";
import { trustedBrowserOrigin } from "./trusted-browser-origin";

const prod = {
  NODE_ENV: "production",
  BETTER_AUTH_URL: "https://auvrionbiosphere.com",
};
const valid = {
  origin: "https://auvrionbiosphere.com",
  host: "auvrionbiosphere.com",
  "x-forwarded-host": "auvrionbiosphere.com",
  "x-forwarded-proto": "https",
  "sec-fetch-site": "same-origin",
};
function req(
  headers: Record<string, string>,
  target = "http://app:3000/api/operator/copilot/analyze",
) {
  return new Request(target, { method: "POST", headers });
}

describe("production browser origin behind Caddy", () => {
  it("allows the verified public host", () => {
    expect(trustedBrowserOrigin(req(valid), prod)).toBe(true);
  });
  it("rejects an external Origin", () => {
    expect(
      trustedBrowserOrigin(
        req({ ...valid, origin: "https://evil.invalid" }),
        prod,
      ),
    ).toBe(false);
  });
  it("rejects a mismatched Host or forwarded Host", () => {
    expect(
      trustedBrowserOrigin(req({ ...valid, host: "evil.invalid" }), prod),
    ).toBe(false);
    expect(
      trustedBrowserOrigin(
        req({ ...valid, "x-forwarded-host": "evil.invalid" }),
        prod,
      ),
    ).toBe(false);
  });
  it("rejects insecure forwarded proto or unproved proxy", () => {
    expect(
      trustedBrowserOrigin(
        req({ ...valid, "x-forwarded-proto": "http" }),
        prod,
      ),
    ).toBe(false);
    expect(trustedBrowserOrigin(req({ origin: valid.origin }), prod)).toBe(
      false,
    );
  });
  it("rejects missing or cross-site Origin", () => {
    expect(trustedBrowserOrigin(req({ host: valid.host }), prod)).toBe(false);
    expect(
      trustedBrowserOrigin(
        req({ ...valid, "sec-fetch-site": "cross-site" }),
        prod,
      ),
    ).toBe(false);
  });
  it("retains direct localhost same-origin in development", () => {
    const dev = {
      NODE_ENV: "development",
      BETTER_AUTH_URL: "http://localhost:3000",
    };
    expect(
      trustedBrowserOrigin(
        req(
          { origin: "http://localhost:3000" },
          "http://localhost:3000/api/operator/copilot/analyze",
        ),
        dev,
      ),
    ).toBe(true);
  });
  it("does not trust arbitrary configured public origins", () => {
    expect(
      trustedBrowserOrigin(req(valid), {
        NODE_ENV: "production",
        BETTER_AUTH_URL: "https://evil.invalid",
      }),
    ).toBe(false);
  });
});
