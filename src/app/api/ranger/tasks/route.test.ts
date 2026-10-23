import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkOperationalAccess: vi.fn(),
  listMyRangerTasks: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.checkOperationalAccess,
}));
vi.mock("@/server/ranger/ranger-task-service", () => ({
  listMyRangerTasks: mocks.listMyRangerTasks,
}));

import { GET } from "./route";

const org = "00000000-0000-4000-8000-000000000001";
const url = `http://localhost/api/ranger/tasks?organizationId=${org}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkOperationalAccess.mockResolvedValue({
    allowed: true,
    userId: "ranger-1",
    role: "ranger",
    organizationId: org,
  });
  mocks.listMyRangerTasks.mockResolvedValue({ items: [], limit: 25 });
});

describe("WC-013 Ranger assigned-only list HTTP guard", () => {
  it("uses signed caller ID, role and org rather than client ranger selector", async () => {
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(mocks.checkOperationalAccess).toHaveBeenCalledWith(org, "ranger");
    expect(mocks.listMyRangerTasks).toHaveBeenCalledWith(org, "ranger-1", 25);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects malformed and extra selectors before authorization", async () => {
    const bad = await GET(new Request(`${url}&rangerUserId=ranger-2`));
    expect(bad.status).toBe(400);
    expect(mocks.checkOperationalAccess).not.toHaveBeenCalled();
    expect(mocks.listMyRangerTasks).not.toHaveBeenCalled();
  });

  it("passes bounded limit of 50", async () => {
    const res = await GET(new Request(`${url}&limit=50`));
    expect(res.status).toBe(200);
    expect(mocks.listMyRangerTasks).toHaveBeenCalledWith(org, "ranger-1", 50);
  });

  it("rejects unauthenticated caller before data read", async () => {
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      status: 401,
      reason: "UNAUTHENTICATED",
    });
    const res = await GET(new Request(url));
    expect(res.status).toBe(401);
    expect(mocks.listMyRangerTasks).not.toHaveBeenCalled();
  });

  it("rejects unauthorized Ranger grant or missing MFA before data read", async () => {
    for (const reason of ["ROLE_OR_SCOPE_DENIED", "MFA_ASSURANCE_REQUIRED"]) {
      mocks.checkOperationalAccess.mockResolvedValue({
        allowed: false,
        status: 403,
        reason,
      });
      const res = await GET(new Request(url));
      expect(res.status).toBe(403);
    }
    expect(mocks.listMyRangerTasks).not.toHaveBeenCalled();
  });

  it("masks unexpected service exception", async () => {
    mocks.listMyRangerTasks.mockRejectedValue(
      new Error("hidden/credentials/secret"),
    );
    const res = await GET(new Request(url));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "RANGER_TASK_READ_FAILED" });
  });
});
