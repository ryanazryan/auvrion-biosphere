import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkOperationalAccess: vi.fn(),
  getScopedObservation: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.checkOperationalAccess,
}));
vi.mock("@/server/observations/observation-service", () => ({
  getScopedObservation: mocks.getScopedObservation,
}));

import { GET } from "./route";

const organizationId = "00000000-0000-4000-8000-000000000001";
const observationId = "00000000-0000-4000-8000-000000000099";
function req() {
  return new Request(
    `http://localhost/api/observations/${observationId}?organizationId=${organizationId}`,
  );
}
function context() {
  return { params: Promise.resolve({ id: observationId }) };
}

describe("AB-WC-008 observation detail HTTP guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: true,
      role: "operator",
      organizationId,
      userId: "user-1",
    });
    mocks.getScopedObservation.mockResolvedValue(null);
  });
  it("returns 404 for an observation missing from the scoped organization", async () => {
    const result = await GET(req(), context());
    expect(result.status).toBe(404);
    expect(mocks.getScopedObservation).toHaveBeenCalledWith(
      organizationId,
      observationId,
    );
  });
  it("does not query the observation without the scoped role", async () => {
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      reason: "MFA_ASSURANCE_REQUIRED",
      status: 403,
    });
    const result = await GET(req(), context());
    expect(result.status).toBe(403);
    expect(mocks.getScopedObservation).not.toHaveBeenCalled();
  });
  it("rejects malformed identifiers before authorization", async () => {
    const result = await GET(
      new Request(
        `http://localhost/api/observations/bad-id?organizationId=${organizationId}`,
      ),
      { params: Promise.resolve({ id: "bad-id" }) },
    );
    expect(result.status).toBe(400);
    expect(mocks.checkOperationalAccess).not.toHaveBeenCalled();
  });
});
