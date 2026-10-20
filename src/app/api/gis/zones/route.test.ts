import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkOperationalAccess: vi.fn(),
  listScopedZones: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.checkOperationalAccess,
}));
vi.mock("@/server/gis/zone-service", () => ({
  listScopedZones: mocks.listScopedZones,
}));

import { GET } from "./route";

const organizationId = "00000000-0000-4000-8000-000000000001";
const req = (query: string) =>
  new Request(`http://localhost/api/gis/zones?${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.checkOperationalAccess.mockResolvedValue({
    allowed: true,
    organizationId,
    role: "operator",
    userId: "operator-test",
  });
  mocks.listScopedZones.mockResolvedValue([
    {
      id: "00000000-0000-4000-8000-000000000002",
      code: "TEST",
      name: "Zona Uji",
      geometry: null,
    },
  ]);
});

describe("AB-WC-011 GIS zones authorization", () => {
  it("lists only scoped zones without geometry", async () => {
    const response = await GET(req(`organizationId=${organizationId}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          code: "TEST",
          name: "Zona Uji",
          geometry: null,
        },
      ],
    });
    expect(mocks.listScopedZones).toHaveBeenCalledWith(organizationId);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects missing, duplicate, invalid and extra filters before access checks", async () => {
    const invalid = [
      "",
      "organizationId=bad",
      `organizationId=${organizationId}&organizationId=${organizationId}`,
      `organizationId=${organizationId}&debug=true`,
    ];
    for (const query of invalid) {
      expect((await GET(req(query))).status).toBe(400);
    }
    expect(mocks.checkOperationalAccess).not.toHaveBeenCalled();
    expect(mocks.listScopedZones).not.toHaveBeenCalled();
  });

  it("denies unauthenticated users without supervisor fallback", async () => {
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      reason: "UNAUTHENTICATED",
      status: 401,
    });
    expect((await GET(req(`organizationId=${organizationId}`))).status).toBe(
      401,
    );
    expect(mocks.checkOperationalAccess).toHaveBeenCalledTimes(1);
    expect(mocks.listScopedZones).not.toHaveBeenCalled();
  });

  it("denies a user who has neither operator nor supervisor access", async () => {
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      reason: "ROLE_OR_SCOPE_DENIED",
      status: 403,
    });
    expect((await GET(req(`organizationId=${organizationId}`))).status).toBe(
      403,
    );
    expect(mocks.checkOperationalAccess).toHaveBeenCalledTimes(2);
    expect(mocks.listScopedZones).not.toHaveBeenCalled();
  });

  it("accepts a supervisor grant after operator role denial", async () => {
    mocks.checkOperationalAccess
      .mockResolvedValueOnce({
        allowed: false,
        reason: "ROLE_OR_SCOPE_DENIED",
        status: 403,
      })
      .mockResolvedValueOnce({
        allowed: true,
        organizationId,
        userId: "supervisor-test",
        role: "supervisor",
      });
    expect((await GET(req(`organizationId=${organizationId}`))).status).toBe(
      200,
    );
    expect(mocks.listScopedZones).toHaveBeenCalledTimes(1);
  });

  it("does not disclose internal database errors", async () => {
    mocks.listScopedZones.mockRejectedValue(
      new Error("secret connection details"),
    );
    const response = await GET(req(`organizationId=${organizationId}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "GIS_ZONES_UNAVAILABLE" });
  });
});
