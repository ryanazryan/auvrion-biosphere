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

import { checkOperationalAccess } from "./operational-access";

describe("checkOperationalAccess", () => {
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

    const result = await checkOperationalAccess("org-1", "ranger");

    expect(result).toEqual({
      allowed: false,
      status: 401,
      reason: "UNAUTHENTICATED",
    });

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects accounts that are not authorized", async () => {
    mocks.checkAccountAccess.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "ACCOUNT_NOT_AUTHORIZED",
    });

    const result = await checkOperationalAccess("org-1", "operator");

    expect(result).toEqual({
      allowed: false,
      status: 403,
      reason: "ACCOUNT_NOT_AUTHORIZED",
    });

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects users without the required role grant", async () => {
    mocks.limit.mockResolvedValue([]);

    const result = await checkOperationalAccess("org-1", "supervisor");

    expect(result).toEqual({
      allowed: false,
      status: 403,
      reason: "ROLE_OR_SCOPE_DENIED",
    });
  });

  it("enforces user, organization, role and revocation filters", async () => {
    await checkOperationalAccess("org-2", "ranger");

    const expression = mocks.where.mock.calls[0]?.[0];

    expect(expression).toBeDefined();

    const query = new PgDialect().sqlToQuery(expression as SQL);

    expect(query.sql).toContain('"user_id"');
    expect(query.sql).toContain('"organization_id"');
    expect(query.sql).toContain('"role"');
    expect(query.sql).toContain('"revoked_at"');
    expect(query.sql).toMatch(/is null/i);

    expect(query.params).toEqual(["user-1", "org-2", "ranger"]);
  });

  it("requires MFA even when the role grant is valid", async () => {
    mocks.limit.mockResolvedValue([{ id: "grant-1" }]);

    const result = await checkOperationalAccess("org-1", "ranger");

    expect(result).toEqual({
      allowed: false,
      status: 403,
      reason: "MFA_ASSURANCE_REQUIRED",
    });
  });
});
