import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transitionApprovedCase: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/workflow/case-transition-service", () => ({
  transitionApprovedCase: mocks.transitionApprovedCase,
}));

import { WorkflowFailure } from "@/server/workflow/approved-case-policy";
import { POST } from "./route";

const org = "00000000-0000-4000-8000-000000000001";
const caseId = "00000000-0000-4000-8000-000000000002";
const key = "00000000-0000-4000-8000-000000000003";
const origin = "http://localhost:3000";
const context = { params: Promise.resolve({ id: caseId }) };
const valid = {
  transitionId: "AB-TR-010",
  expectedVersion: 1,
  reason: "Reviewed validated source evidence",
};

function request(
  body: unknown = valid,
  options: {
    path?: string;
    origin?: string | null;
    idempotencyKey?: string | null;
    mime?: string;
    contentEncoding?: string;
    fetchSite?: string;
    rawBody?: string;
  } = {},
): Request {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? origin;
  if (options.idempotencyKey !== null)
    headers["idempotency-key"] = options.idempotencyKey ?? key;
  headers["content-type"] = options.mime ?? "application/json";
  if (options.contentEncoding)
    headers["content-encoding"] = options.contentEncoding;
  if (options.fetchSite) headers["sec-fetch-site"] = options.fetchSite;
  return new Request(
    `${origin}${options.path ?? `/api/cases/${caseId}/transitions?organizationId=${org}`}`,
    {
      method: "POST",
      headers,
      body: options.rawBody ?? JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BETTER_AUTH_URL = origin;
  mocks.transitionApprovedCase.mockResolvedValue({
    caseId,
    status: "under_review",
    version: 2,
    taskId: null,
    replayed: false,
  });
});

describe("AB-WC-012 Slice 01C HTTP case mutation guard", () => {
  it("calls transactional service with server-selected Case/org/request scope", async () => {
    const result = await POST(request(), context);
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(mocks.transitionApprovedCase).toHaveBeenCalledWith({
      ...valid,
      caseId,
      organizationId: org,
      requestId: key,
    });
  });

  it("returns a replay without creating a new transition", async () => {
    mocks.transitionApprovedCase.mockResolvedValueOnce({
      caseId,
      status: "under_review",
      version: 2,
      taskId: null,
      replayed: true,
    });
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect((await response.json()).replayed).toBe(true);
  });

  it("accepts the approved Supervisor assignment shape", async () => {
    const assignment = {
      rangerUserId: "ranger-123",
      zoneId: "00000000-0000-4000-8000-000000000004",
      title: "Assess PM sensor anomaly",
      instructions: "Inspect area without approaching hazards",
      safetyNotes: "Stop and report unsafe conditions",
    };
    const response = await POST(
      request({
        transitionId: "AB-TR-013",
        expectedVersion: 3,
        reason: "Supervisor assignment after evidence review",
        assignment,
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.transitionApprovedCase).toHaveBeenCalledWith(
      expect.objectContaining({ assignment }),
    );
  });

  it("rejects invalid Case, organization and duplicate organization query", async () => {
    const badPaths = [
      `/api/cases/not-a-uuid/transitions?organizationId=${org}`,
      `/api/cases/${caseId}/transitions?organizationId=not-a-uuid`,
      `/api/cases/${caseId}/transitions?organizationId=${org}&organizationId=${org}`,
    ];
    for (const path of badPaths) {
      const response = await POST(request(valid, { path }), {
        params: Promise.resolve({
          id: path.includes("not-a-uuid/transitions") ? "not-a-uuid" : caseId,
        }),
      });
      expect(response.status).toBe(400);
    }
    expect(mocks.transitionApprovedCase).not.toHaveBeenCalled();
  });

  it("rejects missing or untrusted origin and cross-site requests", async () => {
    expect((await POST(request(valid, { origin: null }), context)).status).toBe(
      403,
    );
    expect(
      (
        await POST(
          request(valid, { origin: "https://attacker.invalid" }),
          context,
        )
      ).status,
    ).toBe(403);
    expect(
      (await POST(request(valid, { fetchSite: "cross-site" }), context)).status,
    ).toBe(403);
    expect(mocks.transitionApprovedCase).not.toHaveBeenCalled();
  });

  it("rejects missing or malformed Idempotency-Key", async () => {
    expect(
      (await POST(request(valid, { idempotencyKey: null }), context)).status,
    ).toBe(400);
    expect(
      (await POST(request(valid, { idempotencyKey: "bad-key" }), context))
        .status,
    ).toBe(400);
    expect(mocks.transitionApprovedCase).not.toHaveBeenCalled();
  });

  it("rejects unsupported MIME and compressed content", async () => {
    expect(
      (await POST(request(valid, { mime: "text/plain" }), context)).status,
    ).toBe(415);
    expect(
      (await POST(request(valid, { contentEncoding: "gzip" }), context)).status,
    ).toBe(415);
    expect(mocks.transitionApprovedCase).not.toHaveBeenCalled();
  });

  it("bounds streamed JSON to 8 KiB", async () => {
    const response = await POST(
      request(valid, { rawBody: "x".repeat(8193) }),
      context,
    );
    expect(response.status).toBe(413);
    expect(mocks.transitionApprovedCase).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON and non-object bodies", async () => {
    expect((await POST(request(valid, { rawBody: "{" }), context)).status).toBe(
      400,
    );
    expect((await POST(request([]), context)).status).toBe(400);
    expect(mocks.transitionApprovedCase).not.toHaveBeenCalled();
  });

  it("blocks client scope/actor/task overrides rather than silently trusting them", async () => {
    for (const injection of [
      { ...valid, organizationId: org },
      { ...valid, caseId },
      { ...valid, actor: "supervisor" },
      { ...valid, taskId: "fake" },
      { ...valid, requestId: key },
    ]) {
      const response = await POST(request(injection), context);
      expect(response.status).toBe(400);
    }
    expect(mocks.transitionApprovedCase).not.toHaveBeenCalled();
  });

  it("denies unknown and Proposed transitions without calling the service", async () => {
    for (const transitionId of ["AB-TR-014", "AB-TR-022", "AB-TR-999"]) {
      const response = await POST(request({ ...valid, transitionId }), context);
      expect(response.status).toBe(403);
    }
    expect(mocks.transitionApprovedCase).not.toHaveBeenCalled();
  });

  it("rejects inappropriate assignment payload and unknown nested assignment keys", async () => {
    const wrong = await POST(request({ ...valid, assignment: {} }), context);
    expect(wrong.status).toBe(422);
    const invalid = await POST(
      request({
        transitionId: "AB-TR-013",
        expectedVersion: 3,
        reason: valid.reason,
        assignment: { owner: "admin" },
      }),
      context,
    );
    expect(invalid.status).toBe(400);
    expect(mocks.transitionApprovedCase).not.toHaveBeenCalled();
  });

  it("maps domain denial and conflict statuses without leaking details", async () => {
    for (const [status, code] of [
      [401, "UNAUTHENTICATED"],
      [403, "MFA_ASSURANCE_REQUIRED"],
      [404, "CASE_NOT_FOUND"],
      [409, "CASE_STATE_OR_VERSION_CONFLICT"],
      [422, "RANGER_NOT_ACTIVE_OR_SCOPED"],
    ] as const) {
      mocks.transitionApprovedCase.mockRejectedValueOnce(
        new WorkflowFailure(status, code),
      );
      const response = await POST(request(), context);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: code });
    }
  });

  it("returns generic 500 for unexpected internal failures", async () => {
    mocks.transitionApprovedCase.mockRejectedValueOnce(
      new Error("database secret: password"),
    );
    const response = await POST(request(), context);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "CASE_TRANSITION_FAILED" });
  });
});
