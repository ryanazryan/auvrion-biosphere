import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  infer: vi.fn(),
}));

vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.access,
}));
vi.mock("@/server/evidence/playback-service", () => ({
  readAuthorizedObservationAudio: mocks.read,
  EvidencePlaybackError: class EvidencePlaybackError extends Error {},
}));
vi.mock("@/server/bioacoustics/perch-worker", () => ({
  inferPerchFromVerifiedWav: mocks.infer,
  PerchWorkerError: class PerchWorkerError extends Error {},
}));

import { POST } from "./route";

const observationId = "7eccd6ac-8a62-4fd1-a982-743bcb67d592";
const organizationId = "bdc0b465-f2cc-454b-9465-de23ca714c63";
const mediaId = "57e9a749-c04f-4b42-b0ef-0dd5031078fb";
const headers = {
  origin: "https://auvrionbiosphere.com",
  host: "auvrionbiosphere.com",
  "x-forwarded-host": "auvrionbiosphere.com",
  "x-forwarded-proto": "https",
  "sec-fetch-site": "same-origin",
  "content-type": "application/json",
};
const ctx = { params: Promise.resolve({ id: observationId }) };
function makeRequest(overrides: Record<string, string> = {}) {
  return new Request(
    `http://app:3000/api/observations/${observationId}/bioacoustics/analyze?organizationId=${organizationId}`,
    {
      method: "POST",
      headers: { ...headers, ...overrides },
      body: JSON.stringify({ mediaId }),
    },
  );
}

describe("Perch inference POST behind production Caddy", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://auvrionbiosphere.com");
    mocks.access.mockReset();
    mocks.read.mockReset();
    mocks.infer.mockReset();
    mocks.access.mockResolvedValue({ allowed: true });
    mocks.read.mockResolvedValue({ bytes: Buffer.from("mock-verified-wav") });
    mocks.infer.mockResolvedValue({
      status: "no_candidates",
      verification: "unverified",
      provider: "Google",
      modelId: "perch-v2",
      modelVersion: "test",
      candidates: [],
    });
  });

  it("reaches scoped evidence service for verified production origin", async () => {
    const response = await POST(makeRequest(), ctx);
    expect(response.status).toBe(200);
    expect(mocks.access).toHaveBeenCalledWith(organizationId, "operator");
    expect(mocks.read).toHaveBeenCalledWith({
      organizationId,
      observationId,
      mediaId,
    });
    expect(mocks.infer).toHaveBeenCalledTimes(1);
  });

  const invalidHeaders: Array<[string, Record<string, string>]> = [
    ["different browser origin", { origin: "https://attacker.invalid" }],
    ["mismatched host", { host: "attacker.invalid" }],
    ["mismatched proxy host", { "x-forwarded-host": "attacker.invalid" }],
    ["insecure forwarded protocol", { "x-forwarded-proto": "http" }],
    ["cross-site", { "sec-fetch-site": "cross-site" }],
  ];
  it.each(invalidHeaders)(
    "blocks %s before private audio access",
    async (_name, overrides) => {
      const response = await POST(makeRequest(overrides), ctx);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "ORIGIN_NOT_ALLOWED" });
      expect(mocks.access).not.toHaveBeenCalled();
      expect(mocks.read).not.toHaveBeenCalled();
    },
  );
});
