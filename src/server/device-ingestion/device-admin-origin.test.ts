import { describe, expect, it } from "vitest";
import { trustedAdminOrigin } from "./device-admin-origin";

const env = {
  NODE_ENV: "production",
  BETTER_AUTH_URL: "https://auvrionbiosphere.com",
};
function request(
  headers: Record<string, string>,
  target = "http://app:3000/api/admin/devices",
) {
  return new Request(target, { method: "POST", headers });
}
const valid = {
  origin: "https://auvrionbiosphere.com",
  host: "auvrionbiosphere.com",
  "x-forwarded-host": "auvrionbiosphere.com",
  "x-forwarded-proto": "https",
  "sec-fetch-site": "same-origin",
};

describe("Device administration browser origin policy", () => {
  it("allows configured production domain behind Caddy", () => {
    expect(trustedAdminOrigin(request(valid), env)).toBe(true);
  });
  it("blocks a foreign origin", () => {
    expect(
      trustedAdminOrigin(
        request({ ...valid, origin: "https://evil.invalid" }),
        env,
      ),
    ).toBe(false);
  });
  it("blocks a forged forwarding host", () => {
    expect(
      trustedAdminOrigin(
        request({ ...valid, "x-forwarded-host": "evil.invalid" }),
        env,
      ),
    ).toBe(false);
  });
  it("requires forwarded TLS", () => {
    expect(
      trustedAdminOrigin(
        request({ ...valid, "x-forwarded-proto": "http" }),
        env,
      ),
    ).toBe(false);
  });
  it("rejects missing origin", () => {
    expect(trustedAdminOrigin(request({ host: valid.host }), env)).toBe(false);
  });
  it("rejects cross-site browser requests", () => {
    expect(
      trustedAdminOrigin(
        request({ ...valid, "sec-fetch-site": "cross-site" }),
        env,
      ),
    ).toBe(false);
  });
  it("keeps localhost same-origin behavior for local development", () => {
    expect(
      trustedAdminOrigin(
        request(
          { origin: "http://localhost:3000" },
          "http://localhost:3000/api/admin/devices",
        ),
        {
          NODE_ENV: "development",
          BETTER_AUTH_URL: "http://localhost:3000",
        },
      ),
    ).toBe(true);
  });
  it("rejects internal requests without forwarding proof", () => {
    expect(
      trustedAdminOrigin(
        request({ origin: "https://auvrionbiosphere.com" }),
        env,
      ),
    ).toBe(false);
  });
});
