import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkOperationalAccess: vi.fn(),
  listScopedGisObservations: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.checkOperationalAccess,
}));

vi.mock("@/server/gis/gis-service", () => ({
  listScopedGisObservations: mocks.listScopedGisObservations,
}));

import { GET } from "./route";

const organizationId = "00000000-0000-4000-8000-000000000001";

const zoneId = "00000000-0000-4000-8000-000000000002";

function request(query = "") {
  const separator = query ? `&${query}` : "";

  return new Request(
    `http://localhost/api/gis/observations?organizationId=${organizationId}${separator}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.checkOperationalAccess.mockResolvedValue({
    allowed: true,
    userId: "operator-test",
    organizationId,
    role: "operator",
  });

  mocks.listScopedGisObservations.mockResolvedValue({
    items: [],
    total: 0,
    limit: 25,
    offset: 0,
    zoneFilterApplied: null,
  });
});

describe("AB-WC-011 GIS HTTP access", () => {
  it("allows authorized scoped reads", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);

    expect(mocks.checkOperationalAccess).toHaveBeenCalledWith(
      organizationId,
      "operator",
    );

    expect(mocks.listScopedGisObservations).toHaveBeenCalledOnce();

    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("passes a validated zone filter", async () => {
    const response = await GET(request(`zoneId=${zoneId}`));

    expect(response.status).toBe(200);

    expect(mocks.listScopedGisObservations).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        zoneId,
      }),
    );
  });

  it("rejects duplicate and invalid zone filters", async () => {
    const duplicate = await GET(request(`zoneId=${zoneId}&zoneId=${zoneId}`));

    const invalid = await GET(request("zoneId=invalid"));

    expect(duplicate.status).toBe(400);
    expect(invalid.status).toBe(400);

    expect(mocks.checkOperationalAccess).not.toHaveBeenCalled();

    expect(mocks.listScopedGisObservations).not.toHaveBeenCalled();
  });

  it("denies unauthenticated requests", async () => {
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      status: 401,
      reason: "UNAUTHENTICATED",
    });

    const response = await GET(request());

    expect(response.status).toBe(401);

    expect(mocks.checkOperationalAccess).toHaveBeenCalledTimes(1);

    expect(mocks.listScopedGisObservations).not.toHaveBeenCalled();
  });

  it("denies users without operator or supervisor grants", async () => {
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "ROLE_OR_SCOPE_DENIED",
    });

    const response = await GET(request());

    expect(response.status).toBe(403);

    expect(mocks.checkOperationalAccess).toHaveBeenCalledTimes(2);

    expect(mocks.listScopedGisObservations).not.toHaveBeenCalled();
  });

  it("permits a scoped supervisor after operator denial", async () => {
    mocks.checkOperationalAccess
      .mockResolvedValueOnce({
        allowed: false,
        status: 403,
        reason: "ROLE_OR_SCOPE_DENIED",
      })
      .mockResolvedValueOnce({
        allowed: true,
        userId: "supervisor-test",
        organizationId,
        role: "supervisor",
      });

    const response = await GET(request());

    expect(response.status).toBe(200);

    expect(mocks.checkOperationalAccess).toHaveBeenNthCalledWith(
      2,
      organizationId,
      "supervisor",
    );
  });

  it("sanitizes internal failures", async () => {
    mocks.listScopedGisObservations.mockRejectedValue(
      new Error("D:/private/spatial/secret.sql"),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "GIS_OBSERVATIONS_UNAVAILABLE",
    });

    expect(JSON.stringify(body)).not.toContain("D:/private/spatial/secret.sql");
  });
});
