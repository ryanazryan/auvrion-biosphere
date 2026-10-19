/**
 * AB-WC-004: real PostgreSQL account / role / admin-capability / assurance checks.
 *
 * Guarded, opt-in test, using a SEPARATE PostgreSQL container on 127.0.0.1:5434.
 * The trusted request session is represented by a test adapter which reads real
 * session and user rows from PostgreSQL. It does not test Better Auth cookies,
 * cryptographic login, or HTTP protected routes: those are separate WC-004 work.
 *
 * Do not run with dev/prod DB URLs, production credentials, or real users.
 */
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { and, eq, gt, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { accessApplications, userAccess } from "@/server/db/access-schema";
import { session, user } from "@/server/db/auth-schema";
import {
  adminCapabilityGrants,
  organizations,
  roleGrants,
} from "@/server/db/grants-schema";
import { mfaSessionAssurance } from "@/server/db/mfa-assurance-schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getCurrentSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth/session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));

import { checkAccountAccess } from "./account-access";
import { checkAdminAccess } from "./admin-access";
import { checkOperationalAccess } from "./operational-access";

const ENABLED = process.env.RUN_AUTH_GRANTS_DB_TESTS === "YES";

type Role = "operator" | "supervisor" | "ranger";
type Capability =
  | "review_applications"
  | "manage_access"
  | "manage_devices"
  | "manage_config";
type AccessStatus = "pending_activation" | "active" | "disabled";
type ApplicationStatus =
  | "submitted"
  | "email_verified"
  | "approved"
  | "rejected";
type FixtureOptions = {
  role?: Role | null;
  revokedRole?: boolean;
  adminCapability?: Capability | null;
  revokedAdmin?: boolean;
  accessStatus?: AccessStatus;
  applicationStatus?: ApplicationStatus;
  emailVerified?: boolean;
  applicationEmailMatches?: boolean;
  assurance?: "valid" | "expired" | "absent";
  createSession?: boolean;
};
type Fixture = {
  userId: string;
  applicationId: string;
  organizationId: string;
  sessionId: string;
};

function testDatabaseUrl(): string {
  loadEnvFile(".env.local");
  const source = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (
    !["postgres:", "postgresql:"].includes(source.protocol) ||
    source.hostname !== "127.0.0.1" ||
    source.port !== "5433" ||
    source.pathname !== "/auvrion_dev" ||
    decodeURIComponent(source.username) !== "auvrion_dev"
  ) {
    throw new Error("WC004_REFUSING_UNEXPECTED_DEVELOPMENT_DATABASE");
  }
  source.port = "5434";
  source.pathname = "/auvrion_wc004_test";
  if (source.hostname !== "127.0.0.1" || source.port !== "5434") {
    throw new Error("WC004_REFUSING_NONLOCAL_TEST_DATABASE");
  }
  return source.toString();
}

describe.skipIf(!ENABLED)(
  "AB-WC-004 PostgreSQL authorization (ISOLATED TEST DB)",
  () => {
    let pool: Pool;
    let db: ReturnType<typeof drizzle>;
    let actorId: string;
    const created: Fixture[] = [];

    beforeAll(async () => {
      const connectionString = testDatabaseUrl();
      pool = new Pool({
        connectionString,
        max: 5,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 1000,
      });
      db = drizzle({ client: pool });
      mocks.getDb.mockReturnValue(db);

      // Synthetic FK actor, never a real admin or a real user.
      actorId = `wc004-actor-${randomUUID()}`;
      await db.insert(user).values({
        id: actorId,
        name: "WC004 Synthetic Grant Actor",
        email: `${actorId}@example.invalid`,
        emailVerified: true,
      });
    }, 20000);

    async function makeFixture(options: FixtureOptions = {}): Promise<Fixture> {
      const userId = `wc004-user-${randomUUID()}`;
      const applicationId = randomUUID();
      const organizationId = randomUUID();
      const sessionId = `wc004-session-${randomUUID()}`;
      const now = new Date();
      const sessionExpiresAt = new Date(now.getTime() + 60 * 60 * 1000);
      const email = `${userId}@example.invalid`;
      const applicationStatus = options.applicationStatus ?? "approved";
      const approved = applicationStatus === "approved";
      const fixture = { userId, applicationId, organizationId, sessionId };

      // Record identifiers before writes so partially created fixtures are known.
      created.push(fixture);
      await db.insert(organizations).values({
        id: organizationId,
        code: `WC004-${randomUUID()}`,
        name: "WC004 Synthetic Organization",
      });
      await db.insert(user).values({
        id: userId,
        name: "WC004 Synthetic User",
        email,
        emailVerified: options.emailVerified ?? true,
      });
      await db.insert(accessApplications).values({
        id: applicationId,
        applicantName: "WC004 Synthetic User",
        email:
          options.applicationEmailMatches === false
            ? `mismatch-${userId}@example.invalid`
            : email,
        status: applicationStatus,
        emailVerifiedAt: approved ? now : null,
        reviewedAt: approved ? now : null,
        reviewedById: approved ? actorId : null,
      });
      await db.insert(userAccess).values({
        userId,
        applicationId,
        status: options.accessStatus ?? "active",
        activatedAt:
          (options.accessStatus ?? "active") === "active" ? now : null,
        disabledAt: options.accessStatus === "disabled" ? now : null,
      });
      if (options.role !== null) {
        await db.insert(roleGrants).values({
          userId,
          organizationId,
          role: options.role ?? "operator",
          grantedById: actorId,
          ...(options.revokedRole
            ? { revokedAt: now, revokedById: actorId }
            : {}),
        });
      }
      if (options.adminCapability) {
        await db.insert(adminCapabilityGrants).values({
          userId,
          organizationId,
          capability: options.adminCapability,
          grantedById: actorId,
          ...(options.revokedAdmin
            ? { revokedAt: now, revokedById: actorId }
            : {}),
        });
      }
      if (options.createSession !== false) {
        await db.insert(session).values({
          id: sessionId,
          userId,
          token: `wc004-token-${randomUUID()}`,
          expiresAt: sessionExpiresAt,
          updatedAt: now,
        });
        if ((options.assurance ?? "valid") !== "absent") {
          await db.insert(mfaSessionAssurance).values({
            sessionId,
            userId,
            verifiedAt: now,
            expiresAt:
              options.assurance === "expired"
                ? new Date(now.getTime() - 60_000)
                : new Date(now.getTime() + 15 * 60_000),
          });
        }
      }

      // Test adapter: the "request session" MUST exist as a non-expired
      // record in the real PostgreSQL session table. This does NOT validate
      // cookie signature, which will be covered by subsequent HTTP tests.
      mocks.getCurrentSession.mockImplementation(async () => {
        const [foundSession] = await db
          .select({
            id: session.id,
            userId: session.userId,
            expiresAt: session.expiresAt,
          })
          .from(session)
          .where(
            and(eq(session.id, sessionId), gt(session.expiresAt, new Date())),
          )
          .limit(1);
        if (!foundSession) return null;
        const [foundUser] = await db
          .select({
            id: user.id,
            email: user.email,
            emailVerified: user.emailVerified,
          })
          .from(user)
          .where(eq(user.id, foundSession.userId))
          .limit(1);
        return foundUser ? { user: foundUser, session: foundSession } : null;
      });
      return fixture;
    }

    it.each(["operator", "supervisor", "ranger"] as const)(
      "allows an active %s with correctly scoped grant and real valid MFA row",
      async (role) => {
        const fixture = await makeFixture({ role });
        expect(await checkAccountAccess()).toEqual({
          allowed: true,
          userId: fixture.userId,
        });
        expect(
          await checkOperationalAccess(fixture.organizationId, role),
        ).toEqual({
          allowed: true,
          userId: fixture.userId,
          organizationId: fixture.organizationId,
          role,
        });
      },
    );

    it("rejects wrong operational role even with valid TOTP assurance", async () => {
      const fixture = await makeFixture({ role: "operator" });
      expect(
        await checkOperationalAccess(fixture.organizationId, "supervisor"),
      ).toEqual({
        allowed: false,
        status: 403,
        reason: "ROLE_OR_SCOPE_DENIED",
      });
    });

    it("rejects role-less users", async () => {
      const fixture = await makeFixture({ role: null });
      expect(
        await checkOperationalAccess(fixture.organizationId, "operator"),
      ).toEqual({
        allowed: false,
        status: 403,
        reason: "ROLE_OR_SCOPE_DENIED",
      });
    });

    it("rejects revoked role even when the session still exists", async () => {
      const fixture = await makeFixture({
        role: "operator",
        revokedRole: true,
      });
      expect(
        await checkOperationalAccess(fixture.organizationId, "operator"),
      ).toEqual({
        allowed: false,
        status: 403,
        reason: "ROLE_OR_SCOPE_DENIED",
      });
    });

    it("rejects cross-organization role access", async () => {
      const fixture = await makeFixture({ role: "operator" });
      const otherOrganizationId = randomUUID();
      await db.insert(organizations).values({
        id: otherOrganizationId,
        code: `WC004-${randomUUID()}`,
        name: "WC004 Cross-scope Test Organization",
      });
      // Ensure cleanup tracks both organizations with no user/role attached.
      created.push({ ...fixture, organizationId: otherOrganizationId });
      expect(
        await checkOperationalAccess(otherOrganizationId, "operator"),
      ).toEqual({
        allowed: false,
        status: 403,
        reason: "ROLE_OR_SCOPE_DENIED",
      });
    });

    it.each(["pending_activation", "disabled"] as const)(
      "rejects %s account even with a valid role and MFA",
      async (accessStatus) => {
        const fixture = await makeFixture({ accessStatus });
        expect(
          await checkOperationalAccess(fixture.organizationId, "operator"),
        ).toEqual({
          allowed: false,
          status: 403,
          reason: "ACCOUNT_NOT_AUTHORIZED",
        });
      },
    );

    it("rejects unverified email before role query", async () => {
      const fixture = await makeFixture({ emailVerified: false });
      expect(
        await checkOperationalAccess(fixture.organizationId, "operator"),
      ).toEqual({
        allowed: false,
        status: 403,
        reason: "EMAIL_NOT_VERIFIED",
      });
    });

    it("rejects unapproved applications and mismatched email binding", async () => {
      const first = await makeFixture({ applicationStatus: "email_verified" });
      expect(
        await checkOperationalAccess(first.organizationId, "operator"),
      ).toEqual({
        allowed: false,
        status: 403,
        reason: "ACCOUNT_NOT_AUTHORIZED",
      });
      const second = await makeFixture({ applicationEmailMatches: false });
      expect(
        await checkOperationalAccess(second.organizationId, "operator"),
      ).toEqual({
        allowed: false,
        status: 403,
        reason: "ACCOUNT_NOT_AUTHORIZED",
      });
    });

    it.each(["absent", "expired"] as const)(
      "rejects %s MFA assurance record",
      async (assurance) => {
        const fixture = await makeFixture({ assurance });
        expect(
          await checkOperationalAccess(fixture.organizationId, "operator"),
        ).toEqual({
          allowed: false,
          status: 403,
          reason: "MFA_ASSURANCE_REQUIRED",
        });
      },
    );

    it("rejects deleted DB session, without trusting a former assurance row", async () => {
      const fixture = await makeFixture();
      await db.delete(session).where(eq(session.id, fixture.sessionId));
      const assurance = await db
        .select()
        .from(mfaSessionAssurance)
        .where(eq(mfaSessionAssurance.sessionId, fixture.sessionId));
      expect(assurance).toHaveLength(0); // actual FK cascade
      expect(
        await checkOperationalAccess(fixture.organizationId, "operator"),
      ).toEqual({
        allowed: false,
        status: 401,
        reason: "UNAUTHENTICATED",
      });
    });

    it("allows administrator with capability and valid MFA, but no operational role", async () => {
      const fixture = await makeFixture({
        role: null,
        adminCapability: "manage_access",
      });
      expect(
        await checkAdminAccess(fixture.organizationId, "manage_access"),
      ).toEqual({
        allowed: true,
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        capability: "manage_access",
      });
      expect(
        await checkOperationalAccess(fixture.organizationId, "operator"),
      ).toEqual({
        allowed: false,
        status: 403,
        reason: "ROLE_OR_SCOPE_DENIED",
      });
      expect(
        await checkAdminAccess(fixture.organizationId, "manage_config"),
      ).toEqual({
        allowed: false,
        status: 403,
        reason: "ADMIN_CAPABILITY_DENIED",
      });
    });

    it("rejects revoked admin capability", async () => {
      const fixture = await makeFixture({
        role: null,
        adminCapability: "manage_access",
        revokedAdmin: true,
      });
      expect(
        await checkAdminAccess(fixture.organizationId, "manage_access"),
      ).toEqual({
        allowed: false,
        status: 403,
        reason: "ADMIN_CAPABILITY_DENIED",
      });
    });

    it("rejects admin capability when MFA assurance expired", async () => {
      const fixture = await makeFixture({
        role: null,
        adminCapability: "review_applications",
        assurance: "expired",
      });
      expect(
        await checkAdminAccess(fixture.organizationId, "review_applications"),
      ).toEqual({
        allowed: false,
        status: 403,
        reason: "MFA_ASSURANCE_REQUIRED",
      });
    });

    afterAll(async () => {
      try {
        if (!db) return;
        const userIds = [...new Set(created.map((fixture) => fixture.userId))];
        const applicationIds = [
          ...new Set(created.map((fixture) => fixture.applicationId)),
        ];
        const organizationIds = [
          ...new Set(created.map((fixture) => fixture.organizationId)),
        ];
        if (userIds.length > 0) {
          await db
            .delete(mfaSessionAssurance)
            .where(inArray(mfaSessionAssurance.userId, userIds));
          await db.delete(session).where(inArray(session.userId, userIds));
          await db
            .delete(roleGrants)
            .where(inArray(roleGrants.userId, userIds));
          await db
            .delete(adminCapabilityGrants)
            .where(inArray(adminCapabilityGrants.userId, userIds));
          await db
            .delete(userAccess)
            .where(inArray(userAccess.userId, userIds));
          await db
            .delete(accessApplications)
            .where(inArray(accessApplications.id, applicationIds));
          await db.delete(user).where(inArray(user.id, userIds));
        }
        if (organizationIds.length > 0) {
          await db
            .delete(organizations)
            .where(inArray(organizations.id, organizationIds));
        }
        if (actorId) await db.delete(user).where(eq(user.id, actorId));
      } finally {
        if (pool) await pool.end();
      }
    }, 20000);
  },
);
