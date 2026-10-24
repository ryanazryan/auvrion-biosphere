/**
 * AB-WC-017 Slice 03A — HTTP administration contract, no real DB connection.
 * Authorization and persistence are mocked at their boundaries; the real
 * production route handlers and request parsing/origin checks are exercised.
 * Real Postgres CAS, revocation and rollback are covered by Slice 02B DB tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkAdminAccess: vi.fn(),
  createPostgresDeviceLifecycle: vi.fn(),
  provision: vi.fn(),
  rotate: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("server-only", () => ({}));
// The HTTP contract tests must not connect to any PostgreSQL instance.
vi.mock("pg", () => ({ Pool: class TestPool {} }));
vi.mock("@/server/authorization/admin-access", () => ({
  checkAdminAccess: mocks.checkAdminAccess,
}));
vi.mock("@/server/device-ingestion/device-pg-store", () => ({
  createPostgresDeviceLifecycle: mocks.createPostgresDeviceLifecycle,
  DevicePersistenceError: class DevicePersistenceError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  },
}));

import { DeviceLifecycleError } from "@/server/device-ingestion/device-lifecycle";
import { DevicePersistenceError } from "@/server/device-ingestion/device-pg-store";
import { POST as lifecyclePost } from "./[id]/route";
import { POST as provisionPost } from "./route";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "wc017-admin-user";
const SECRET = `abdev_v1_${"a".repeat(43)}`;
const ORIGIN = "http://localhost:3000";

const createPayload = { organizationId: ORGANIZATION_ID, sourceId: SOURCE_ID };
const rotatePayload = { organizationId: ORGANIZATION_ID, action: "rotate" };
const revokePayload = { organizationId: ORGANIZATION_ID, action: "revoke" };

function request(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function provisionRequest(body: unknown = createPayload, headers = {}) {
  return request("/api/admin/devices", body, headers);
}

function lifecycleRequest(body: unknown = rotatePayload, headers = {}) {
  return request(`/api/admin/devices/${DEVICE_ID}`, body, headers);
}

function mutate(req: Request, id = DEVICE_ID) {
  return lifecyclePost(req, { params: Promise.resolve({ id }) });
}

async function errorCode(response: Response) {
  const body = (await response.json()) as { error?: string };
  return body.error;
}

function expectNoMutation() {
  expect(mocks.provision).not.toHaveBeenCalled();
  expect(mocks.rotate).not.toHaveBeenCalled();
  expect(mocks.revoke).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(
    "DATABASE_URL",
    "postgres://unused-test:unused@127.0.0.1:1/unused",
  );
  mocks.checkAdminAccess.mockResolvedValue({
    allowed: true,
    userId: ACTOR_ID,
    organizationId: ORGANIZATION_ID,
    capability: "manage_devices",
  });
  mocks.createPostgresDeviceLifecycle.mockReturnValue({
    provision: mocks.provision,
    rotate: mocks.rotate,
    revoke: mocks.revoke,
  });
  mocks.provision.mockResolvedValue({
    deviceId: DEVICE_ID,
    token: SECRET,
    version: 1,
  });
  mocks.rotate.mockResolvedValue({
    deviceId: DEVICE_ID,
    token: SECRET,
    version: 2,
  });
  mocks.revoke.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/devices — provision", () => {
  it("returns credential only on successful provisioning; binds a verified scoped actor", async () => {
    const response = await provisionPost(provisionRequest());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vary")).toContain("Origin");
    expect(await response.json()).toEqual({
      deviceId: DEVICE_ID,
      credential: SECRET,
      version: 1,
    });
    expect(mocks.checkAdminAccess).toHaveBeenCalledOnce();
    expect(mocks.checkAdminAccess).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      "manage_devices",
    );
    expect(mocks.createPostgresDeviceLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ACTOR_ID,
        actorOrganizationId: ORGANIZATION_ID,
      }),
    );
    expect(mocks.provision).toHaveBeenCalledOnce();
    expect(mocks.provision).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, manageDevices: true },
      SOURCE_ID,
    );
  });

  it.each([
    ["missing Origin", "missing"],
    ["cross-site Origin", "cross-origin"],
    ["cross-site Fetch Metadata", "cross-site"],
  ])("rejects %s before authorization", async (_name, kind) => {
    const req = provisionRequest();
    if (kind === "missing") req.headers.delete("origin");
    if (kind === "cross-origin")
      req.headers.set("origin", "https://hostile.example");
    if (kind === "cross-site") req.headers.set("sec-fetch-site", "cross-site");
    const response = await provisionPost(req);
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("INVALID_ORIGIN");
    expect(mocks.checkAdminAccess).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it.each([
    ["wrong content type", createPayload, { "content-type": "text/plain" }],
    ["malformed org UUID", { ...createPayload, organizationId: "bad" }, {}],
    ["malformed source UUID", { ...createPayload, sourceId: "bad" }, {}],
    ["unexpected JSON field", { ...createPayload, status: "active" }, {}],
    ["array JSON", [createPayload], {}],
    ["oversized Content-Length", createPayload, { "content-length": "4096" }],
  ] as const)(
    "rejects %s before authorization",
    async (_name, body, headers) => {
      const response = await provisionPost(provisionRequest(body, headers));
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("INVALID_REQUEST");
      expect(mocks.checkAdminAccess).not.toHaveBeenCalled();
      expectNoMutation();
    },
  );

  it("rejects malformed JSON without touching authorization", async () => {
    const response = await provisionPost(
      new Request(`${ORIGIN}/api/admin/devices`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        },
        body: "{malformed",
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.checkAdminAccess).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it("enforces the actual streamed body size even with no Content-Length", async () => {
    const response = await provisionPost(
      provisionRequest({ ...createPayload, filler: "a".repeat(1100) }),
    );
    expect(response.status).toBe(400);
    expect(mocks.checkAdminAccess).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it.each([
    ["UNAUTHENTICATED", 401],
    ["ADMIN_CAPABILITY_DENIED", 403],
    ["MFA_ASSURANCE_REQUIRED", 403],
  ] as const)(
    "denies %s without issuing a credential",
    async (reason, status) => {
      mocks.checkAdminAccess.mockResolvedValue({
        allowed: false,
        reason,
        status,
      });
      const response = await provisionPost(provisionRequest());
      expect(response.status).toBe(status);
      expect(await errorCode(response)).toBe(reason);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(mocks.createPostgresDeviceLifecycle).not.toHaveBeenCalled();
      expectNoMutation();
    },
  );

  it("maps an inactive source to 422 without returning a credential", async () => {
    mocks.provision.mockRejectedValue(
      new DevicePersistenceError("ACTIVE_LISTEN_SOURCE_REQUIRED"),
    );
    const response = await provisionPost(provisionRequest());
    expect(response.status).toBe(422);
    const body = await response.text();
    expect(body).toContain("ACTIVE_LISTEN_SOURCE_REQUIRED");
    expect(body).not.toContain(SECRET);
  });

  it("returns a conflict when the same source is already provisioned", async () => {
    mocks.provision.mockRejectedValue(
      new DevicePersistenceError("SOURCE_ALREADY_PROVISIONED"),
    );
    const response = await provisionPost(provisionRequest());
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("SOURCE_ALREADY_PROVISIONED");
  });

  it("returns generic 503 on database failure, never a token", async () => {
    mocks.provision.mockRejectedValue(new Error("private-db-internal-error"));
    const response = await provisionPost(provisionRequest());
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("DEVICE_OPERATION_UNAVAILABLE");
    expect(body).not.toContain("private-db-internal-error");
    expect(body).not.toContain(SECRET);
  });
});

describe("POST /api/admin/devices/:id — rotate and revoke", () => {
  it("rotates with scoped actor and returns the new credential", async () => {
    const response = await mutate(lifecycleRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      deviceId: DEVICE_ID,
      credential: SECRET,
      version: 2,
    });
    expect(mocks.checkAdminAccess).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      "manage_devices",
    );
    expect(mocks.rotate).toHaveBeenCalledOnce();
    expect(mocks.rotate).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, manageDevices: true },
      DEVICE_ID,
    );
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("revokes with scoped actor and never returns a credential", async () => {
    const response = await mutate(lifecycleRequest(revokePayload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      deviceId: DEVICE_ID,
      status: "revoked",
    });
    expect(mocks.revoke).toHaveBeenCalledOnce();
    expect(mocks.revoke).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, manageDevices: true },
      DEVICE_ID,
    );
    expect(mocks.rotate).not.toHaveBeenCalled();
  });

  it("rejects malformed device path before authorization", async () => {
    const response = await mutate(lifecycleRequest(), "not-a-uuid");
    expect(response.status).toBe(400);
    expect(mocks.checkAdminAccess).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it.each([
    ["unknown action", { ...rotatePayload, action: "delete" }],
    ["extra property", { ...rotatePayload, version: 0 }],
    ["missing organization", { action: "rotate" }],
    ["invalid org", { ...rotatePayload, organizationId: "wrong-org" }],
  ])("rejects %s before authorization", async (_name, body) => {
    const response = await mutate(lifecycleRequest(body));
    expect(response.status).toBe(400);
    expect(mocks.checkAdminAccess).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it("rejects cross-site mutation before authorization", async () => {
    const response = await mutate(
      lifecycleRequest(revokePayload, { origin: "https://hostile.example" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.checkAdminAccess).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it("denies revoked MFA assurance without mutating device", async () => {
    mocks.checkAdminAccess.mockResolvedValue({
      allowed: false,
      reason: "MFA_ASSURANCE_REQUIRED",
      status: 403,
    });
    const response = await mutate(lifecycleRequest(revokePayload));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("MFA_ASSURANCE_REQUIRED");
    expectNoMutation();
  });

  it("denies an organization outside the actor's manage_devices scope", async () => {
    mocks.checkAdminAccess.mockResolvedValue({
      allowed: false,
      reason: "ADMIN_CAPABILITY_DENIED",
      status: 403,
    });
    const response = await mutate(lifecycleRequest());
    expect(response.status).toBe(403);
    expectNoMutation();
  });

  it("maps stale concurrent rotation to conflict; does not reveal token", async () => {
    mocks.rotate.mockRejectedValue(
      new DeviceLifecycleError("STALE_DEVICE_VERSION", 409),
    );
    const response = await mutate(lifecycleRequest());
    expect(response.status).toBe(409);
    const data = await response.text();
    expect(data).toContain("STALE_DEVICE_VERSION");
    expect(data).not.toContain(SECRET);
  });

  it("rejects cross-org device mutation without exposing credentials", async () => {
    mocks.revoke.mockRejectedValue(
      new DeviceLifecycleError("DEVICE_SCOPE_DENIED", 403),
    );
    const response = await mutate(lifecycleRequest(revokePayload));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("DEVICE_SCOPE_DENIED");
  });

  it("fails closed when persistence fails during rotation", async () => {
    mocks.rotate.mockRejectedValue(new Error("private-sql-detail"));
    const response = await mutate(lifecycleRequest());
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain("DEVICE_OPERATION_UNAVAILABLE");
    expect(text).not.toContain("private-sql-detail");
    expect(text).not.toContain(SECRET);
  });
});
