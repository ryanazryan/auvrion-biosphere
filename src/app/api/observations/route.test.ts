import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkOperationalAccess: vi.fn(),
  createManualObservation: vi.fn(),
  listScopedObservations: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.checkOperationalAccess,
}));
vi.mock("@/server/observations/observation-service", () => ({
  createManualObservation: mocks.createManualObservation,
  listScopedObservations: mocks.listScopedObservations,
  ObservationServiceError: class ObservationServiceError extends Error {
    constructor(
      public status: number,
      public reason: string,
    ) {
      super(reason);
    }
  },
}));

import { GET, POST } from "./route";

const organizationId = "00000000-0000-4000-8000-000000000001";
const sourceId = "00000000-0000-4000-8000-000000000002";
const payload = {
  organizationId,
  sourceId,
  sourceRecordId: "manual-unit-1",
  domain: "biodiversity",
  ingestionMode: "historical",
  observedAt: "2026-10-18T08:00:00+08:00",
  locationUnknownReason: "not-collected",
};

function post(body: unknown) {
  return new Request("http://localhost/api/observations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("AB-WC-008 observation HTTP guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: true,
      userId: "user-1",
      organizationId,
      role: "operator",
    });
    mocks.createManualObservation.mockResolvedValue({
      id: sourceId,
      replayed: false,
    });
    mocks.listScopedObservations.mockResolvedValue({
      items: [],
      total: 0,
      limit: 25,
      offset: 0,
    });
  });

  it("denies POST without operational grant before touching persistence", async () => {
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      reason: "ROLE_OR_SCOPE_DENIED",
      status: 403,
    });
    const response = await POST(post(payload));
    expect(response.status).toBe(403);
    expect(mocks.createManualObservation).not.toHaveBeenCalled();
  });

  it("requires operator role for writes and validates the organization selector", async () => {
    const response = await POST(post(payload));
    expect(response.status).toBe(201);
    expect(mocks.checkOperationalAccess).toHaveBeenCalledWith(
      organizationId,
      "operator",
    );
    expect(mocks.createManualObservation).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects unauthorized client review mutations", async () => {
    const response = await POST(post({ ...payload, quality: "valid" }));
    expect(response.status).toBe(400);
    expect(mocks.checkOperationalAccess).not.toHaveBeenCalled();
  });

  it("denies reader with neither operator nor supervisor grants", async () => {
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      reason: "ROLE_OR_SCOPE_DENIED",
      status: 403,
    });
    const result = await GET(
      new Request(
        `http://localhost/api/observations?organizationId=${organizationId}`,
      ),
    );
    expect(result.status).toBe(403);
    expect(mocks.listScopedObservations).not.toHaveBeenCalled();
    expect(mocks.checkOperationalAccess).toHaveBeenCalledTimes(2);
  });

  it("allows scoped supervisor read only after operator grant is denied", async () => {
    mocks.checkOperationalAccess
      .mockResolvedValueOnce({
        allowed: false,
        reason: "ROLE_OR_SCOPE_DENIED",
        status: 403,
      })
      .mockResolvedValueOnce({
        allowed: true,
        userId: "user-1",
        organizationId,
        role: "supervisor",
      });
    const result = await GET(
      new Request(
        `http://localhost/api/observations?organizationId=${organizationId}`,
      ),
    );
    expect(result.status).toBe(200);
    expect(mocks.checkOperationalAccess).toHaveBeenNthCalledWith(
      2,
      organizationId,
      "supervisor",
    );
    expect(mocks.listScopedObservations).toHaveBeenCalledOnce();
  });

  it("rejects unauthenticated list without role fallback", async () => {
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      reason: "UNAUTHENTICATED",
      status: 401,
    });
    const result = await GET(
      new Request(
        `http://localhost/api/observations?organizationId=${organizationId}`,
      ),
    );
    expect(result.status).toBe(401);
    expect(mocks.checkOperationalAccess).toHaveBeenCalledOnce();
  });
});
