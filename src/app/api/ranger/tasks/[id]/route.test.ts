import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkOperationalAccess: vi.fn(),
  getMyRangerTask: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.checkOperationalAccess,
}));
vi.mock("@/server/ranger/ranger-task-service", () => ({
  getMyRangerTask: mocks.getMyRangerTask,
}));

import { GET } from "./route";

const org = "00000000-0000-4000-8000-000000000001";
const taskId = "00000000-0000-4000-8000-000000000002";
const request = (u: string) => new Request(u);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const url = `http://localhost/api/ranger/tasks/${taskId}?organizationId=${org}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkOperationalAccess.mockResolvedValue({
    allowed: true,
    userId: "ranger-1",
    role: "ranger",
    organizationId: org,
  });
  mocks.getMyRangerTask.mockResolvedValue({
    id: taskId,
    title: "Check assigned zone",
  });
});

describe("WC-013 Ranger assigned task detail HTTP", () => {
  it("uses authenticated Ranger user ID for detail lookup", async () => {
    const res = await GET(request(url), ctx(taskId));
    expect(res.status).toBe(200);
    expect(mocks.checkOperationalAccess).toHaveBeenCalledWith(org, "ranger");
    expect(mocks.getMyRangerTask).toHaveBeenCalledWith(org, "ranger-1", taskId);
  });

  it("returns 404 when task is outside effective assignment", async () => {
    mocks.getMyRangerTask.mockResolvedValue(null);
    const res = await GET(request(url), ctx(taskId));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
  });

  it("rejects invalid task ID before authorization", async () => {
    const res = await GET(request(url), ctx("invalid"));
    expect(res.status).toBe(400);
    expect(mocks.checkOperationalAccess).not.toHaveBeenCalled();
  });

  it("rejects extra URL query keys", async () => {
    const res = await GET(request(`${url}&rangerUserId=other`), ctx(taskId));
    expect(res.status).toBe(400);
    expect(mocks.getMyRangerTask).not.toHaveBeenCalled();
  });

  it("denies wrong role before reading task", async () => {
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "ROLE_OR_SCOPE_DENIED",
    });
    const res = await GET(request(url), ctx(taskId));
    expect(res.status).toBe(403);
    expect(mocks.getMyRangerTask).not.toHaveBeenCalled();
  });

  it("never leaks internal errors", async () => {
    mocks.getMyRangerTask.mockRejectedValue(
      new Error("/private/task/information"),
    );
    const res = await GET(request(url), ctx(taskId));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "RANGER_TASK_READ_FAILED" });
  });
});
