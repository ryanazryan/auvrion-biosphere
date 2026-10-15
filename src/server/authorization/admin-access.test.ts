import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn((_expression: unknown) => ({ limit }));
  const from = vi.fn((_table: unknown) => ({ where }));
  const select = vi.fn((_columns: unknown) => ({ from }));
  const getDb = vi.fn(() => ({ select }));
  const checkAccountAccess = vi.fn();

  return {
    limit,
    where,
    from,
    select,
    getDb,
    checkAccountAccess,
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/server/authorization/account-access", () => ({
  checkAccountAccess: mocks.checkAccountAccess,
}));

vi.mock("@/server/db", () => ({
  getDb: mocks.getDb,
}));

import { checkAdminAccess } from "./admin-access";

describe("checkAdminAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.checkAccountAccess.mockResolvedValue({
      allowed: true,
      userId: "user-1",
    });

    mocks.limit.mockResolvedValue([]);
  });

  it("rejects unauthenticated users", async () => {
    mocks.checkAccountAccess.mockResolvedValue({
      allowed: false,
      status: 401,
      reason: "UNAUTHENTICATED",
    });

    const result = await checkAdminAccess("org-1", "manage_access");

    expect(result).toEqual({
      allowed: false,
      status: 401,
      reason: "UNAUTHENTICATED",
    });

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects inactive accounts", async () => {
    mocks.checkAccountAccess.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "ACCOUNT_NOT_AUTHORIZED",
    });

    const result = await checkAdminAccess("org-1", "manage_access");

    expect(result.allowed).toBe(false);

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects users without the required capability", async () => {
    mocks.limit.mockResolvedValue([]);

    const result = await checkAdminAccess("org-1", "manage_access");

    expect(result).toEqual({
      allowed: false,
      status: 403,
      reason: "ADMIN_CAPABILITY_DENIED",
    });
  });

  it("enforces user, organization, capability and revocation filters", async () => {
    await checkAdminAccess("org-1", "manage_access");

    const expression = mocks.where.mock.calls[0]?.[0];

    expect(expression).toBeDefined();

    const query = new PgDialect().sqlToQuery(expression as SQL);

    expect(query.sql).toContain('"user_id"');
    expect(query.sql).toContain('"organization_id"');
    expect(query.sql).toContain('"capability"');
    expect(query.sql).toContain('"revoked_at"');
    expect(query.sql).toMatch(/is null/i);

    expect(query.params).toEqual(["user-1", "org-1", "manage_access"]);
  });

  it("requires MFA even with a valid capability grant", async () => {
    mocks.limit.mockResolvedValue([{ id: "grant-1" }]);

    const result = await checkAdminAccess("org-1", "manage_access");

    expect(result).toEqual({
      allowed: false,
      status: 403,
      reason: "MFA_ASSURANCE_REQUIRED",
    });
  });
});
