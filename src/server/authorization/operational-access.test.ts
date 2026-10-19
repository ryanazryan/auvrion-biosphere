import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminCapabilityGrants, roleGrants } from "@/server/db/grants-schema";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn((_expression: unknown) => ({ limit }));
  const from = vi.fn((_table: unknown) => ({ where }));
  const select = vi.fn((_columns: unknown) => ({ from }));
  const getDb = vi.fn(() => ({ select }));
  const checkAccountAccess = vi.fn();
  const getCurrentSession = vi.fn();
  const hasMfaSessionAssurance = vi.fn();

  return {
    limit,
    where,
    from,
    select,
    getDb,
    checkAccountAccess,
    getCurrentSession,
    hasMfaSessionAssurance,
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/server/authorization/account-access", () => ({
  checkAccountAccess: mocks.checkAccountAccess,
}));

vi.mock("@/server/auth/session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));

vi.mock("@/server/auth/mfa-assurance-store", () => ({
  hasMfaSessionAssurance: mocks.hasMfaSessionAssurance,
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
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { id: "session-1" },
    });
    mocks.hasMfaSessionAssurance.mockResolvedValue(false);
  });

  it("rejects unauthenticated users before querying grants", async () => {
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
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
    expect(mocks.hasMfaSessionAssurance).not.toHaveBeenCalled();
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
    expect(mocks.hasMfaSessionAssurance).not.toHaveBeenCalled();
  });

  it("rejects unverified email before querying role grants", async () => {
    mocks.checkAccountAccess.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "EMAIL_NOT_VERIFIED",
    });

    const result = await checkOperationalAccess("org-1", "ranger");

    expect(result).toEqual({
      allowed: false,
      status: 403,
      reason: "EMAIL_NOT_VERIFIED",
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejects users without the required active role grant", async () => {
    const result = await checkOperationalAccess("org-1", "supervisor");

    expect(result).toEqual({
      allowed: false,
      status: 403,
      reason: "ROLE_OR_SCOPE_DENIED",
    });
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
    expect(mocks.hasMfaSessionAssurance).not.toHaveBeenCalled();
  });

  it("enforces user, organization, role, and non-revoked grant filters", async () => {
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

  it("does not substitute admin capabilities for operational roles", async () => {
    const result = await checkOperationalAccess("org-1", "supervisor");

    expect(mocks.from).toHaveBeenCalledWith(roleGrants);
    expect(mocks.from).not.toHaveBeenCalledWith(adminCapabilityGrants);
    expect(result).toEqual({
      allowed: false,
      status: 403,
      reason: "ROLE_OR_SCOPE_DENIED",
    });
  });

  it("requires MFA even if an active role grant exists", async () => {
    mocks.limit.mockResolvedValue([{ id: "grant-1" }]);

    const result = await checkOperationalAccess("org-1", "ranger");

    expect(result).toEqual({
      allowed: false,
      status: 403,
      reason: "MFA_ASSURANCE_REQUIRED",
    });
    expect(mocks.hasMfaSessionAssurance).toHaveBeenCalledWith({
      sessionId: "session-1",
      userId: "user-1",
    });
  });

  it("rejects a valid grant if the current server session is missing", async () => {
    mocks.limit.mockResolvedValue([{ id: "grant-1" }]);
    mocks.getCurrentSession.mockResolvedValue(null);

    const result = await checkOperationalAccess("org-1", "ranger");

    expect(result).toEqual({
      allowed: false,
      status: 403,
      reason: "MFA_ASSURANCE_REQUIRED",
    });
    expect(mocks.hasMfaSessionAssurance).not.toHaveBeenCalled();
  });

  it("rejects a valid grant if the current session user differs", async () => {
    mocks.limit.mockResolvedValue([{ id: "grant-1" }]);
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "other-user" },
      session: { id: "other-session" },
    });

    const result = await checkOperationalAccess("org-1", "operator");

    expect(result).toEqual({
      allowed: false,
      status: 403,
      reason: "MFA_ASSURANCE_REQUIRED",
    });
    expect(mocks.hasMfaSessionAssurance).not.toHaveBeenCalled();
  });

  it("rejects a grant if MFA assurance is expired or absent", async () => {
    mocks.limit.mockResolvedValue([{ id: "grant-1" }]);
    mocks.hasMfaSessionAssurance.mockResolvedValue(false);

    const result = await checkOperationalAccess("org-1", "supervisor");

    expect(result).toEqual({
      allowed: false,
      status: 403,
      reason: "MFA_ASSURANCE_REQUIRED",
    });
  });

  it.each(["operator", "supervisor", "ranger"] as const)(
    "allows %s only when account, scoped role, current session, and MFA are valid",
    async (role) => {
      mocks.limit.mockResolvedValue([{ id: "grant-1" }]);
      mocks.hasMfaSessionAssurance.mockResolvedValue(true);

      const result = await checkOperationalAccess("org-1", role);

      expect(result).toEqual({
        allowed: true,
        userId: "user-1",
        organizationId: "org-1",
        role,
      });
      expect(mocks.hasMfaSessionAssurance).toHaveBeenCalledOnce();
      expect(mocks.hasMfaSessionAssurance).toHaveBeenCalledWith({
        sessionId: "session-1",
        userId: "user-1",
      });
    },
  );
});
