import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  answer: vi.fn(),
  observation: vi.fn(),
  overview: vi.fn(),
  region: vi.fn(),
  environment: vi.fn(),
  species: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.authorize,
}));
vi.mock("@/server/copilot/answer", () => ({
  generateCopilotAnswer: mocks.answer,
  PRODUCT_KNOWLEDGE: { product: "Auvrion" },
  CopilotUnavailable: class CopilotUnavailable extends Error {},
}));
vi.mock("@/server/copilot/observation", () => ({
  readCopilotObservation: mocks.observation,
}));
vi.mock("@/server/copilot/intelligence", () => ({
  readScopedIntelligence: mocks.overview,
}));
vi.mock("@/server/copilot/regions", () => ({
  resolveRegion: mocks.region,
  getCopilotEnvironment: mocks.environment,
  CopilotRegionError: class CopilotRegionError extends Error {},
}));
vi.mock("@/server/copilot/species", () => ({
  getSpeciesReference: mocks.species,
}));

import { POST } from "./route";

const ORG = "11111111-1111-4111-8111-111111111111";
const OBS = "bec0bcd5-3535-4a8d-87fa-c88d8dd149a4";
const endpoint = `http://localhost:3000/api/operator/copilot/analyze?organizationId=${ORG}`;
function call(body: unknown, init: { origin?: string; url?: string } = {}) {
  return POST(
    new Request(init.url ?? endpoint, {
      method: "POST",
      headers: {
        origin: init.origin ?? "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({
    allowed: true,
    status: 200,
    userId: "user-1",
    organizationId: ORG,
  });
  mocks.answer.mockResolvedValue({
    answer: "Konteks tersedia.",
    advisoryOnly: true,
    usage: null,
  });
  mocks.overview.mockResolvedValue({
    organizationId: ORG,
    totalInWindow: 0,
    trends: [],
  });
  mocks.observation.mockResolvedValue({
    observation: {
      id: OBS,
      domain: "environmental_risk",
      ingestionMode: "live",
      source: { id: "source-fixture", code: "MANUAL-TEST" },
      observedAt: "2026-10-25T03:00:00.000Z",
      receivedAt: "2026-10-25T03:05:00.000Z",
      unknownObservedTimeReason: null,
      quality: "unreviewed",
      location: { hasCoordinates: false, unknownReason: null },
      measurements: [],
      provenance: { limitations: [] },
    },
    listen: null,
  });
  mocks.environment.mockResolvedValue({
    region: "Banjarbaru",
    bmkg: { state: "available" },
    nasa: { state: "unavailable" },
    sources: { bmkg: "https://data.bmkg.go.id/prakiraan-cuaca/" },
  });
});
describe("AB-WC-024 authorized operational copilot", () => {
  it("rejects unauthenticated access before reading any records", async () => {
    mocks.authorize.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "MFA_ASSURANCE_REQUIRED",
    });
    const response = await call({
      question: "Jelaskan observasi",
      context: "overview",
    });
    expect(response.status).toBe(403);
    expect(mocks.observation).not.toHaveBeenCalled();
    expect(mocks.answer).not.toHaveBeenCalled();
  });
  it("rejects cross-origin request", async () => {
    const response = await call(
      { question: "Jelaskan observasi", context: "overview" },
      { origin: "https://attacker.test" },
    );
    expect(response.status).toBe(403);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("does not call OpenAI for observation from a different organization", async () => {
    mocks.observation.mockResolvedValue(null);
    const response = await call({
      question: `Jelaskan observasi ${OBS}`,
      context: "overview",
    });
    expect(response.status).toBe(404);
    expect(mocks.observation).toHaveBeenCalledWith(ORG, OBS);
    expect(mocks.answer).not.toHaveBeenCalled();
  });
  it("sends a scope-resolved observation, not an arbitrary client object", async () => {
    const response = await call({
      question: `Jelaskan observasi ${OBS}`,
      context: "overview",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.observation).toHaveBeenCalledWith(ORG, OBS);
    expect(mocks.answer).toHaveBeenCalledOnce();
  });
  it("avoids provider cost when the active observation has no selected ID", async () => {
    const response = await call({
      question: "Jelaskan observasi ini",
      context: "observation",
    });
    expect(response.status).toBe(200);
    expect((await response.json()).answer).toContain("UUID observasi");
    expect(mocks.answer).not.toHaveBeenCalled();
  });
  it("rejects unknown client-provided payload keys", async () => {
    const response = await call({
      question: "apa observasi",
      context: "overview",
      admin: true,
    });
    expect(response.status).toBe(400);
  });
});
