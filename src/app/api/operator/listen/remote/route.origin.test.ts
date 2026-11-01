import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.access,
}));

vi.mock("@/server/device-ingestion/listen-remote-store", () => ({
  DEVICE_UUID:
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  readBoundedJson: async (req: Request) => req.json(),
  remotePool: () => ({ query: mocks.query }),
  remoteReply: (data: unknown, code = 200) =>
    Response.json(data, { status: code }),
}));

import { POST } from "./route";

const organizationId = "bdc0b465-f2cc-454b-9465-de23ca714c63";
const deviceId = "519df240-902c-4bd0-98f7-ac7a89a5f5f9";
const headers = {
  origin: "https://auvrionbiosphere.com",
  host: "auvrionbiosphere.com",
  "x-forwarded-host": "auvrionbiosphere.com",
  "x-forwarded-proto": "https",
  "sec-fetch-site": "same-origin",
  "content-type": "application/json",
};

function makeRequest(overrides: Record<string, string> = {}): Request {
  return new Request("http://app:3000/api/operator/listen/remote", {
    method: "POST",
    headers: { ...headers, ...overrides },
    body: JSON.stringify({
      organizationId,
      deviceId,
      action: "start",
      intervalSeconds: 60,
    }),
  });
}

describe("Operator LISTEN remote command behind production Caddy", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://auvrionbiosphere.com");
    mocks.access.mockReset();
    mocks.query.mockReset();
    mocks.access.mockResolvedValue({ allowed: true });
    mocks.query.mockResolvedValue({
      rowCount: 1,
      rows: [{ command_revision: "1" }],
    });
  });

  it("accepts verified HTTPS public origin despite HTTP internal request URL", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "queued", revision: 1 });
    expect(mocks.access).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  const invalidHeaders: Array<[string, Record<string, string>]> = [
    ["external origin", { origin: "https://attacker.invalid" }],
    ["forged host", { host: "attacker.invalid" }],
    ["forged forwarded host", { "x-forwarded-host": "attacker.invalid" }],
    ["HTTP forwarded proto", { "x-forwarded-proto": "http" }],
    ["cross-site browser request", { "sec-fetch-site": "cross-site" }],
  ];
  it.each(invalidHeaders)(
    "rejects %s before access and database",
    async (_name, override) => {
      const response = await POST(makeRequest(override));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "INVALID_ORIGIN" });
      expect(mocks.access).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );
});
