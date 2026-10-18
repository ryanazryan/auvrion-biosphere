import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accessLifecycleAudit } from "@/server/db/access-lifecycle-audit-schema";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import { session, user } from "@/server/db/auth-schema";
import {
  adminCapabilityGrants,
  organizations,
  roleGrants,
} from "@/server/db/grants-schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  checkAdminAccess: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/authorization/admin-access", () => ({
  checkAdminAccess: mocks.checkAdminAccess,
}));

import { POST } from "./route";

type OperationalRole = "operator" | "supervisor" | "ranger";
type AccessStatus = "pending_activation" | "active" | "disabled";
type Fixture = {
  organizationExists: boolean;
  targetExists: boolean;
  scopedGrantExists: boolean;
  privilegedTarget: boolean;
  applicationApproved: boolean;
  identityVerified: boolean;
  identityMatchesApplication: boolean;
  status: AccessStatus;
  activeRoles: OperationalRole[];
  failAuditInsert: boolean;
};
type Operation = {
  kind: "update" | "insert" | "delete";
  table: unknown;
  values?: Record<string, unknown>;
};

const TARGET_USER_ID = "test-operational-user";
const ADMIN_USER_ID = "test-admin-user";
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const APPLICATION_ID = "22222222-2222-4222-8222-222222222222";

const defaultFixture: Fixture = {
  organizationExists: true,
  targetExists: true,
  scopedGrantExists: true,
  privilegedTarget: false,
  applicationApproved: true,
  identityVerified: true,
  identityMatchesApplication: true,
  status: "active",
  activeRoles: ["ranger"],
  failAuditInsert: false,
};

function setupDatabase(override: Partial<Fixture> = {}) {
  const fixture = { ...defaultFixture, ...override };
  const operations: Operation[] = [];
  const selections: Array<{ table: unknown; predicate: SQL; limit: number }> =
    [];
  const rowLocks: string[] = [];

  function rowsFor(table: unknown, limit: number): Record<string, unknown>[] {
    if (table === organizations) {
      return fixture.organizationExists ? [{ id: ORG_ID }] : [];
    }
    if (table === userAccess) {
      return fixture.targetExists
        ? [
            {
              userId: TARGET_USER_ID,
              applicationId: APPLICATION_ID,
              status: fixture.status,
            },
          ]
        : [];
    }
    if (table === roleGrants) {
      if (limit === 1) {
        return fixture.scopedGrantExists ? [{ id: "historical-grant" }] : [];
      }
      return fixture.activeRoles.map((role, index) => ({
        id: `active-grant-${index}`,
        role,
      }));
    }
    if (table === adminCapabilityGrants) {
      return fixture.privilegedTarget ? [{ id: "privileged-grant" }] : [];
    }
    if (table === accessApplications) {
      return [
        {
          status: fixture.applicationApproved ? "approved" : "submitted",
          email: "target@example.test",
          emailVerifiedAt: fixture.applicationApproved ? new Date() : null,
          reviewedAt: fixture.applicationApproved ? new Date() : null,
          reviewedById: fixture.applicationApproved ? ADMIN_USER_ID : null,
        },
      ];
    }
    if (table === user) {
      return [
        {
          email: fixture.identityMatchesApplication
            ? "target@example.test"
            : "different@example.test",
          emailVerified: fixture.identityVerified,
        },
      ];
    }
    throw new Error("TEST_UNEXPECTED_SELECT_TABLE");
  }

  function selectBuilder() {
    return {
      from: (table: unknown) => ({
        where: (predicate: SQL) => ({
          limit: (count: number) => {
            selections.push({ table, predicate, limit: count });
            const rows = rowsFor(table, count);
            const result = Promise.resolve(rows) as Promise<typeof rows> & {
              for: (lock: string) => Promise<typeof rows>;
            };
            result.for = async (lock: string) => {
              rowLocks.push(lock);
              return rows;
            };
            return result;
          },
        }),
      }),
    };
  }

  const tx = {
    select: vi.fn(selectBuilder),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (_predicate: SQL) => {
          operations.push({ kind: "update", table, values });
        },
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table === accessLifecycleAudit && fixture.failAuditInsert) {
          throw new Error("SIMULATED_AUDIT_INSERT_FAILURE");
        }
        operations.push({ kind: "insert", table, values });
      },
    })),
    delete: vi.fn((table: unknown) => ({
      where: async (_predicate: SQL) => {
        operations.push({ kind: "delete", table });
      },
    })),
  };
  const db = {
    select: vi.fn(selectBuilder),
    transaction: vi.fn(async (callback: (arg: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  mocks.getDb.mockReturnValue(db);
  return { db, tx, operations, selections, rowLocks };
}

function makeRequest(
  body: unknown = {
    action: "set_role",
    role: "operator",
    reason: "Role changed after approved staffing review",
  },
  origin = "http://localhost:3000",
) {
  return new Request(
    `http://localhost:3000/api/admin/access-users/${TARGET_USER_ID}/lifecycle`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify(body),
    },
  );
}

async function invoke(
  body?: unknown,
  targetUserId = TARGET_USER_ID,
  origin = "http://localhost:3000",
) {
  return POST(makeRequest(body, origin), {
    params: Promise.resolve({ id: targetUserId }),
  });
}

async function getCode(response: Response) {
  const body = (await response.json()) as { error?: string; outcome?: string };
  return body.error ?? body.outcome;
}

function assertNoMutation(fixture: ReturnType<typeof setupDatabase>) {
  expect(fixture.operations).toEqual([]);
}

describe("POST /api/admin/access-users/:id/lifecycle (mocked DB contract)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_LOCAL_ACCESS_REQUESTS", "YES");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    mocks.checkAdminAccess.mockResolvedValue({
      allowed: true,
      userId: ADMIN_USER_ID,
      organizationId: ORG_ID,
      capability: "manage_access",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed outside the local development environment", async () => {
    const fixture = setupDatabase();
    vi.stubEnv("NODE_ENV", "production");
    const response = await invoke();
    expect(response.status).toBe(404);
    expect(await getCode(response)).toBe("NOT_FOUND");
    expect(mocks.getDb).not.toHaveBeenCalled();
    assertNoMutation(fixture);
  });

  it("rejects cross-origin requests before database access", async () => {
    const fixture = setupDatabase();
    const response = await invoke(
      undefined,
      TARGET_USER_ID,
      "https://evil.example",
    );
    expect(response.status).toBe(403);
    expect(await getCode(response)).toBe("INVALID_ORIGIN");
    expect(mocks.getDb).not.toHaveBeenCalled();
    assertNoMutation(fixture);
  });

  it("rejects malformed target user IDs", async () => {
    const fixture = setupDatabase();
    const response = await invoke(undefined, "not/a/valid/id");
    expect(response.status).toBe(400);
    expect(await getCode(response)).toBe("INVALID_USER_ID");
    assertNoMutation(fixture);
  });

  it.each([
    [
      "unsupported action",
      { action: "grant_admin", reason: "Valid reason longer than ten chars" },
    ],
    ["invalid reason", { action: "revoke_role", reason: "short" }],
    [
      "unexpected role on revoke",
      {
        action: "revoke_role",
        role: "ranger",
        reason: "Valid reason longer than ten chars",
      },
    ],
  ])("rejects %s without entering a transaction", async (_name, body) => {
    const fixture = setupDatabase();
    const response = await invoke(body);
    expect(response.status).toBe(400);
    expect(await getCode(response)).toBe("INVALID_LIFECYCLE_REQUEST");
    expect(fixture.db.transaction).not.toHaveBeenCalled();
    assertNoMutation(fixture);
  });

  it("requires an authenticated administrator with manage_access", async () => {
    const fixture = setupDatabase();
    mocks.checkAdminAccess.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "ADMIN_CAPABILITY_DENIED",
    });
    const response = await invoke();
    expect(response.status).toBe(403);
    expect(await getCode(response)).toBe("ADMIN_CAPABILITY_DENIED");
    expect(mocks.checkAdminAccess).toHaveBeenCalledWith(
      ORG_ID,
      "manage_access",
    );
    expect(fixture.db.transaction).not.toHaveBeenCalled();
    assertNoMutation(fixture);
  });

  it("denies lifecycle modification of the current administrator", async () => {
    const fixture = setupDatabase();
    const response = await invoke(undefined, ADMIN_USER_ID);
    expect(response.status).toBe(403);
    expect(await getCode(response)).toBe("SELF_LIFECYCLE_CHANGE_DENIED");
    expect(fixture.db.transaction).not.toHaveBeenCalled();
    assertNoMutation(fixture);
  });

  it("denies unknown target users with zero writes", async () => {
    const fixture = setupDatabase({ targetExists: false });
    const response = await invoke();
    expect(response.status).toBe(404);
    expect(await getCode(response)).toBe("TARGET_NOT_FOUND");
    assertNoMutation(fixture);
  });

  it("denies cross-organization target users without a historical local grant", async () => {
    const fixture = setupDatabase({ scopedGrantExists: false });
    const response = await invoke();
    expect(response.status).toBe(403);
    expect(await getCode(response)).toBe("TARGET_SCOPE_DENIED");
    assertNoMutation(fixture);
    const scopedLookup = fixture.selections.find(
      (entry) => entry.table === roleGrants && entry.limit === 1,
    );
    expect(scopedLookup).toBeDefined();
    const query = new PgDialect().sqlToQuery(scopedLookup?.predicate as SQL);
    expect(query.sql).toContain('"organization_id"');
    expect(query.params).toEqual([TARGET_USER_ID, ORG_ID]);
  });

  it("does not modify any target with an active admin capability", async () => {
    const fixture = setupDatabase({ privilegedTarget: true });
    const response = await invoke();
    expect(response.status).toBe(403);
    expect(await getCode(response)).toBe("PRIVILEGED_TARGET_REQUIRES_REVIEW");
    assertNoMutation(fixture);
  });

  it.each([
    ["application not approved", { applicationApproved: false }],
    ["email not verified", { identityVerified: false }],
    ["email changed since approval", { identityMatchesApplication: false }],
  ] as const)("rejects %s without writing", async (_name, override) => {
    const fixture = setupDatabase(override);
    const response = await invoke();
    expect(response.status).toBe(409);
    expect(await getCode(response)).toBe("TARGET_NOT_APPROVED");
    assertNoMutation(fixture);
  });

  it("rejects changing a role to its current value", async () => {
    const fixture = setupDatabase({ activeRoles: ["operator"] });
    const response = await invoke();
    expect(response.status).toBe(409);
    expect(await getCode(response)).toBe("ROLE_UNCHANGED");
    assertNoMutation(fixture);
  });

  it("rejects ambiguous multi-role changes, rather than guessing a role", async () => {
    const fixture = setupDatabase({ activeRoles: ["operator", "ranger"] });
    const response = await invoke();
    expect(response.status).toBe(409);
    expect(await getCode(response)).toBe(
      "MULTIPLE_ACTIVE_ROLES_REVIEW_REQUIRED",
    );
    assertNoMutation(fixture);
  });

  it("changes role, invalidates sessions and writes one role_changed audit entry", async () => {
    const fixture = setupDatabase();
    const response = await invoke();
    expect(response.status).toBe(200);
    expect(await getCode(response)).toBe("role_changed");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fixture.rowLocks).toEqual(["update"]);

    const revoked = fixture.operations.filter(
      (entry) => entry.kind === "update" && entry.table === roleGrants,
    );
    expect(revoked).toHaveLength(1);
    expect(revoked[0]?.values?.revokedAt).toBeInstanceOf(Date);

    const granted = fixture.operations.filter(
      (entry) => entry.kind === "insert" && entry.table === roleGrants,
    );
    expect(granted).toHaveLength(1);
    expect(granted[0]?.values).toMatchObject({
      userId: TARGET_USER_ID,
      organizationId: ORG_ID,
      role: "operator",
      grantedById: ADMIN_USER_ID,
    });

    const sessionDeletes = fixture.operations.filter(
      (entry) => entry.kind === "delete" && entry.table === session,
    );
    expect(sessionDeletes).toHaveLength(1);

    const audit = fixture.operations.filter(
      (entry) =>
        entry.kind === "insert" && entry.table === accessLifecycleAudit,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.values).toMatchObject({
      actorUserId: ADMIN_USER_ID,
      targetUserId: TARGET_USER_ID,
      organizationId: ORG_ID,
      action: "role_changed",
      previousRole: "ranger",
      newRole: "operator",
      previousStatus: "active",
      newStatus: "active",
    });
  });

  it("revokes a role without disabling the account and deletes sessions", async () => {
    const fixture = setupDatabase();
    const response = await invoke({
      action: "revoke_role",
      reason: "End of temporary assignment period",
    });
    expect(response.status).toBe(200);
    expect(await getCode(response)).toBe("role_revoked");
    expect(fixture.operations.some((entry) => entry.table === userAccess)).toBe(
      false,
    );
    expect(fixture.operations.some((entry) => entry.table === session)).toBe(
      true,
    );
    expect(
      fixture.operations.filter(
        (entry) => entry.kind === "insert" && entry.table === roleGrants,
      ),
    ).toHaveLength(0);
    const audit = fixture.operations.find(
      (entry) =>
        entry.kind === "insert" && entry.table === accessLifecycleAudit,
    );
    expect(audit?.values).toMatchObject({
      action: "role_revoked",
      previousRole: "ranger",
      newRole: null,
      newStatus: "active",
    });
  });

  it("disables account, revokes grants, invalidates sessions and audits status", async () => {
    const fixture = setupDatabase();
    const response = await invoke({
      action: "disable_account",
      reason: "Access terminated after administrative review",
    });
    expect(response.status).toBe(200);
    expect(await getCode(response)).toBe("account_disabled");
    const statusUpdate = fixture.operations.find(
      (entry) => entry.kind === "update" && entry.table === userAccess,
    );
    expect(statusUpdate?.values).toMatchObject({ status: "disabled" });
    expect(fixture.operations.some((entry) => entry.table === session)).toBe(
      true,
    );
    const audit = fixture.operations.find(
      (entry) =>
        entry.kind === "insert" && entry.table === accessLifecycleAudit,
    );
    expect(audit?.values).toMatchObject({
      action: "account_disabled",
      previousStatus: "active",
      newStatus: "disabled",
    });
  });

  it("rejects repeated disable without creating a successful audit", async () => {
    const fixture = setupDatabase({ status: "disabled", activeRoles: [] });
    const response = await invoke({
      action: "disable_account",
      reason: "Second attempt must be rejected safely",
    });
    expect(response.status).toBe(409);
    expect(await getCode(response)).toBe("ACCOUNT_DISABLED");
    assertNoMutation(fixture);
  });

  it("returns a generic 503 when audit insertion fails", async () => {
    const fixture = setupDatabase({ failAuditInsert: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await invoke();
      expect(response.status).toBe(503);
      expect(await getCode(response)).toBe("LIFECYCLE_UNAVAILABLE");
      expect(fixture.db.transaction).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalled();
      // This is a MOCK: real PostgreSQL rollback still requires a DB test.
    } finally {
      log.mockRestore();
    }
  });
});
