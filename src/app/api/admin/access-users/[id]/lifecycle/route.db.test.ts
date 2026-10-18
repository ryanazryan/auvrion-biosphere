/**
 * Opt-in LOCAL PostgreSQL integration tests for AB-WC-003.
 *
 * Scope: actual lifecycle POST transaction, FKs, session deletion, audit,
 * rollback, and concurrent mutation of isolated synthetic target accounts.
 * checkAdminAccess is deliberately mocked; this is NOT an end-to-end auth test.
 *
 * Run ONLY against 127.0.0.1:5433/auvrion_dev with
 * RUN_LIFECYCLE_DB_TESTS=YES.
 */
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { accessLifecycleAudit } from "@/server/db/access-lifecycle-audit-schema";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import { session, user } from "@/server/db/auth-schema";
import { organizations, roleGrants } from "@/server/db/grants-schema";
import { mfaSessionAssurance } from "@/server/db/mfa-assurance-schema";

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

const ENABLED = process.env.RUN_LIFECYCLE_DB_TESTS === "YES";
const ORIGIN = "http://localhost:3000";
const REASON = "PR6 isolated local DB security acceptance";

function assertLocalDatabaseUrl(connectionString: string): void {
  const url = new URL(connectionString);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "5433" ||
    url.pathname !== "/auvrion_dev" ||
    decodeURIComponent(url.username) !== "auvrion_dev"
  ) {
    throw new Error("REFUSING_NONLOCAL_OR_UNEXPECTED_DATABASE");
  }
}

type Role = "operator" | "supervisor" | "ranger";
type Action = "set_role" | "revoke_role" | "disable_account";
type Fixture = { userId: string; applicationId: string; sessionId: string };

describe.skipIf(!ENABLED)(
  "AB-WC-003 lifecycle PostgreSQL integration (LOCAL ONLY)",
  () => {
    let pool: Pool;
    let db: ReturnType<typeof drizzle>;
    let orgId: string;
    let actorId: string;

    const fixtures: Fixture[] = [];

    beforeAll(async () => {
      // NODE_ENV defaults to 'test' in Vitest; the route intentionally only works
      // in 'development'. These flags only affect this isolated test process.
      loadEnvFile(".env.local");
      const connectionString = process.env.DATABASE_URL ?? "";
      assertLocalDatabaseUrl(connectionString);

      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("ENABLE_LOCAL_ACCESS_REQUESTS", "YES");
      vi.stubEnv("BETTER_AUTH_URL", ORIGIN);

      pool = new Pool({
        connectionString,
        max: 5,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 1000,
      });
      db = drizzle({ client: pool });
      mocks.getDb.mockReturnValue(db);

      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.code, "AUVRION-LOCAL"))
        .limit(1);
      if (!org) throw new Error("LOCAL_TEST_ORGANIZATION_MISSING");
      orgId = org.id;

      actorId = `pr6-actor-${randomUUID()}`;
      await db.insert(user).values({
        id: actorId,
        name: "PR6 Integration Actor (Synthetic)",
        email: `${actorId}@example.invalid`,
        emailVerified: true,
      });

      mocks.checkAdminAccess.mockImplementation(
        async (organizationId: string) => ({
          allowed: true,
          userId: actorId,
          organizationId,
          capability: "manage_access",
        }),
      );
    }, 20000);

    async function makeTarget(
      options: { role?: Role; revoked?: boolean } = {},
    ) {
      const userId = `pr6-target-${randomUUID()}`;
      const applicationId = randomUUID();
      const sessionId = `pr6-session-${randomUUID()}`;
      const token = `pr6-token-${randomUUID()}`;
      const now = new Date();
      const sessionExpiresAt = new Date(now.getTime() + 60 * 60 * 1000);
      const email = `${userId}@example.invalid`;

      // Register IDs before writes, so afterAll can clean partial fixtures too.
      fixtures.push({ userId, applicationId, sessionId });

      await db.insert(user).values({
        id: userId,
        name: "PR6 Synthetic Target",
        email,
        emailVerified: true,
      });
      await db.insert(accessApplications).values({
        id: applicationId,
        applicantName: "PR6 Synthetic Target",
        email,
        status: "approved",
        emailVerifiedAt: now,
        reviewedAt: now,
        reviewedById: actorId,
      });
      await db.insert(userAccess).values({
        userId,
        applicationId,
        status: "active",
        activatedAt: now,
      });
      await db.insert(roleGrants).values({
        userId,
        organizationId: orgId,
        role: options.role ?? "ranger",
        grantedById: actorId,
        ...(options.revoked ? { revokedAt: now, revokedById: actorId } : {}),
      });
      await db.insert(session).values({
        id: sessionId,
        userId,
        token,
        expiresAt: sessionExpiresAt,
        updatedAt: now,
      });
      await db.insert(mfaSessionAssurance).values({
        sessionId,
        userId,
        verifiedAt: now,
        expiresAt: sessionExpiresAt,
      });
      return { userId, applicationId, sessionId };
    }

    function invoke(
      targetUserId: string,
      action: Action,
      role?: Role,
    ): Promise<Response> {
      const url = `${ORIGIN}/api/admin/access-users/${targetUserId}/lifecycle`;
      const request = new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({
          action,
          reason: REASON,
          expectedLifecycleAuditId: null,
          ...(role ? { role } : {}),
        }),
      });
      return POST(request, { params: Promise.resolve({ id: targetUserId }) });
    }

    function activeRoles(userId: string) {
      return db
        .select({ role: roleGrants.role })
        .from(roleGrants)
        .where(
          and(
            eq(roleGrants.userId, userId),
            eq(roleGrants.organizationId, orgId),
            isNull(roleGrants.revokedAt),
          ),
        );
    }

    function audit(userId: string) {
      return db
        .select()
        .from(accessLifecycleAudit)
        .where(eq(accessLifecycleAudit.targetUserId, userId));
    }

    function sessions(userId: string) {
      return db.select().from(session).where(eq(session.userId, userId));
    }

    function assurance(userId: string) {
      return db
        .select()
        .from(mfaSessionAssurance)
        .where(eq(mfaSessionAssurance.userId, userId));
    }

    it("revokes a role atomically; deletes DB session and cascading MFA assurance", async () => {
      const target = await makeTarget();
      expect(await sessions(target.userId)).toHaveLength(1);
      expect(await assurance(target.userId)).toHaveLength(1);

      const response = await invoke(target.userId, "revoke_role");
      expect(response.status).toBe(200);
      expect(await activeRoles(target.userId)).toHaveLength(0);
      expect(await sessions(target.userId)).toHaveLength(0);
      expect(await assurance(target.userId)).toHaveLength(0);
      const [access] = await db
        .select({ status: userAccess.status })
        .from(userAccess)
        .where(eq(userAccess.userId, target.userId));
      expect(access.status).toBe("active");
      const events = await audit(target.userId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorUserId: actorId,
        action: "role_revoked",
        previousRole: "ranger",
        newRole: null,
        reason: REASON,
      });
    }, 20000);

    it("disables an account, revokes grants, and invalidates session+MFA rows", async () => {
      const target = await makeTarget();
      const response = await invoke(target.userId, "disable_account");
      expect(response.status).toBe(200);
      expect(await activeRoles(target.userId)).toHaveLength(0);
      expect(await sessions(target.userId)).toHaveLength(0);
      expect(await assurance(target.userId)).toHaveLength(0);
      const [access] = await db
        .select({
          status: userAccess.status,
          disabledAt: userAccess.disabledAt,
        })
        .from(userAccess)
        .where(eq(userAccess.userId, target.userId));
      expect(access.status).toBe("disabled");
      expect(access.disabledAt).not.toBeNull();
      expect(await audit(target.userId)).toMatchObject([
        { action: "account_disabled", newStatus: "disabled", reason: REASON },
      ]);
    }, 20000);

    it("rolls back status and deleted sessions when audit FK insertion fails", async () => {
      // A revoked historical grant establishes org scope with no active role.
      // Missing actor FK fails at final audit insert AFTER the status update and
      // session deletion, so this verifies REAL PostgreSQL transaction rollback.
      const target = await makeTarget({ revoked: true });
      mocks.checkAdminAccess.mockResolvedValueOnce({
        allowed: true,
        userId: `pr6-nonexistent-${randomUUID()}`,
        organizationId: orgId,
        capability: "manage_access",
      });
      const response = await invoke(target.userId, "disable_account");
      expect(response.status).toBe(503);
      expect(await activeRoles(target.userId)).toHaveLength(0);
      const [access] = await db
        .select({
          status: userAccess.status,
          disabledAt: userAccess.disabledAt,
        })
        .from(userAccess)
        .where(eq(userAccess.userId, target.userId));
      expect(access.status).toBe("active");
      expect(access.disabledAt).toBeNull();
      expect(await sessions(target.userId)).toHaveLength(1);
      expect(await assurance(target.userId)).toHaveLength(1);
      expect(await audit(target.userId)).toHaveLength(0);
    }, 20000);

    it("rejects stale concurrent role changes; only one may commit", async () => {
      const target = await makeTarget();
      const results = await Promise.all([
        invoke(target.userId, "set_role", "operator"),
        invoke(target.userId, "set_role", "supervisor"),
      ]);
      expect(results.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const denied = results.find((response) => response.status === 409);
      expect((await denied?.json()) as { error: string }).toEqual({
        error: "STALE_LIFECYCLE_STATE",
      });
      const roles = await activeRoles(target.userId);
      expect(roles).toHaveLength(1);
      expect(["operator", "supervisor"]).toContain(roles[0].role);
      const events = await audit(target.userId);
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe("role_changed");
      expect(await sessions(target.userId)).toHaveLength(0);
      expect(await assurance(target.userId)).toHaveLength(0);
    }, 20000);

    afterAll(async () => {
      try {
        if (db) {
          const userIds = fixtures.map((fixture) => fixture.userId);
          const applicationIds = fixtures.map(
            (fixture) => fixture.applicationId,
          );
          if (userIds.length) {
            // Delete ONLY our generated synthetic target IDs, never application data.
            await db
              .delete(accessLifecycleAudit)
              .where(inArray(accessLifecycleAudit.targetUserId, userIds));
            await db
              .delete(mfaSessionAssurance)
              .where(inArray(mfaSessionAssurance.userId, userIds));
            await db.delete(session).where(inArray(session.userId, userIds));
            await db
              .delete(roleGrants)
              .where(inArray(roleGrants.userId, userIds));
            await db
              .delete(userAccess)
              .where(inArray(userAccess.userId, userIds));
            await db
              .delete(accessApplications)
              .where(inArray(accessApplications.id, applicationIds));
            await db.delete(user).where(inArray(user.id, userIds));
          }
          if (actorId) await db.delete(user).where(eq(user.id, actorId));
        }
      } finally {
        if (pool) await pool.end();
        vi.unstubAllEnvs();
      }
    }, 20000);
  },
);
