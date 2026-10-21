import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createReviewCase: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/workflow/case-intake-service", () => ({
  createReviewCase: mocks.createReviewCase,
}));

import { POST } from "./route";

const org = "11111111-1111-4111-8111-111111111111";
const obs = "22222222-2222-4222-8222-222222222222";
const valid = {
  organizationId: org,
  observationId: obs,
  title: "Review lingkungan uji",
  reason: "Observasi manual perlu pemeriksaan Operator.",
};
function req(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/cases", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}
describe("WC012 Case intake HTTP security", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    mocks.createReviewCase.mockResolvedValue({
      caseId: obs,
      status: "received",
      replayed: false,
    });
  });
  it("creates Received via server service", async () => {
    const r = await POST(req(valid));
    expect(r.status).toBe(201);
    expect(mocks.createReviewCase).toHaveBeenCalledWith(valid);
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
  it("denies missing and cross-site Origin", async () => {
    expect((await POST(req(valid, "https://evil.example"))).status).toBe(403);
    const missing = new Request("http://localhost:3000/api/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(valid),
    });
    expect((await POST(missing)).status).toBe(403);
    expect(mocks.createReviewCase).not.toHaveBeenCalled();
  });
  it("denies client-forged actor and status", async () => {
    expect((await POST(req({ ...valid, status: "assigned" }))).status).toBe(
      400,
    );
    expect(
      (await POST(req({ ...valid, openedByUserId: "admin" }))).status,
    ).toBe(400);
    expect(mocks.createReviewCase).not.toHaveBeenCalled();
  });
  it("rejects invalid inputs", async () => {
    expect((await POST(req({ ...valid, observationId: "bad" }))).status).toBe(
      400,
    );
    expect((await POST(req({ ...valid, reason: "short" }))).status).toBe(400);
    expect(mocks.createReviewCase).not.toHaveBeenCalled();
  });
  it("sanitizes unexpected internal errors", async () => {
    mocks.createReviewCase.mockRejectedValue(
      new Error("private database password"),
    );
    const r = await POST(req(valid));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain(
      "private database password",
    );
  });
});
