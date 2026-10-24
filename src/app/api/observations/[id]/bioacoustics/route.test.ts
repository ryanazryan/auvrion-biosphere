import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ discover: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/bioacoustics/source-discovery", () => ({
  listAuthorizedBioacousticSources: mocks.discover,
  BioacousticDiscoveryError: class BioacousticDiscoveryError extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code);
    }
  },
}));

import { BioacousticDiscoveryError } from "@/server/bioacoustics/source-discovery";
import { GET } from "./route";

const ORG = "11111111-1111-4111-8111-111111111111";
const OBS = "22222222-2222-4222-8222-222222222222";
function call(organizationId = ORG, observationId = OBS, extras = "") {
  return GET(
    new Request(
      `http://localhost:3000/api/observations/${observationId}/bioacoustics?organizationId=${organizationId}${extras}`,
    ),
    { params: Promise.resolve({ id: observationId }) },
  );
}

describe("WC-023 read-only audio discovery HTTP contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.discover.mockResolvedValue({
      status: "no_audio",
      sources: [],
      verification: "no_ai_predictions_available",
    });
  });
  it("returns no-store status without pretending AI analysis was performed", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      status: "no_audio",
      sources: [],
      verification: "no_ai_predictions_available",
    });
    expect(mocks.discover).toHaveBeenCalledWith({
      organizationId: ORG,
      observationId: OBS,
    });
  });
  it.each(["not-uuid", "", "33333333-3333-4333-8333-333333333333&other=1"])(
    "rejects invalid query %s",
    async (organizationId) => {
      const response = await call(organizationId);
      expect(response.status).toBe(400);
      expect(mocks.discover).not.toHaveBeenCalled();
    },
  );
  it("rejects duplicate organization selectors", async () => {
    const response = await call(ORG, OBS, `&organizationId=${ORG}`);
    expect(response.status).toBe(400);
    expect(mocks.discover).not.toHaveBeenCalled();
  });
  it("rejects invalid observation IDs", async () => {
    const response = await call(ORG, "../../another");
    expect(response.status).toBe(400);
    expect(mocks.discover).not.toHaveBeenCalled();
  });
  it.each([
    [401, "UNAUTHENTICATED"],
    [403, "MFA_ASSURANCE_REQUIRED"],
    [404, "OBSERVATION_NOT_FOUND"],
  ] as const)("propagates scoped denial %i", async (status, code) => {
    mocks.discover.mockRejectedValue(
      new BioacousticDiscoveryError(status, code),
    );
    const response = await call();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
  });
  it("sanitizes unexpected internal errors", async () => {
    mocks.discover.mockRejectedValue(
      new Error("PRIVATE_EVIDENCE_DIR=C:/secret"),
    );
    const response = await call();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});
