import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: vi.fn(),
}));
vi.mock("@/server/authorization/admin-access", () => ({
  checkAdminAccess: vi.fn(),
}));

import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { GET } from "./route";

const ORG = "11111111-1111-4111-8111-111111111111";
const access = vi.mocked(checkOperationalAccess);

function req(q: string, org = ORG) {
  return new Request(
    `http://localhost:3000/api/gis/location-search?organizationId=${org}&q=${encodeURIComponent(q)}`,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("org-scoped WebGIS location suggestions", () => {
  it("rejects invalid query before the provider is contacted", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    const response = await GET(req("a"));
    expect(response.status).toBe(400);
    expect(fetched).not.toHaveBeenCalled();
  });
  it("does not access public provider for unauthorized organizations", async () => {
    access.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "ROLE_OR_SCOPE_DENIED",
    });
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    const response = await GET(req("Palangka Raya"));
    expect(response.status).toBe(403);
    expect(fetched).not.toHaveBeenCalled();
  });
  it("returns only bounded, validated Indonesian place fields", async () => {
    access.mockResolvedValue({
      allowed: true,
      userId: "user1",
      organizationId: ORG,
      role: "operator",
    });
    const fetched = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [113.921, -2.21] },
              properties: {
                countrycode: "ID",
                name: "Palangka Raya",
                state: "Kalimantan Tengah",
                internal: "never-expose",
              },
            },
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [12.1, 55] },
              properties: { countrycode: "DK", name: "Invalid" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetched);
    const response = await GET(req("Palangka Raya"));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      latitude: -2.21,
      longitude: 113.921,
      label: "Palangka Raya, Kalimantan Tengah",
    });
    expect(JSON.stringify(result)).not.toContain("never-expose");
    const upstream = fetched.mock.calls[0][0] as URL;
    expect(upstream.origin).toBe("https://photon.komoot.io");
    expect(upstream.searchParams.get("countrycode")).toBe("ID");
  });
});
