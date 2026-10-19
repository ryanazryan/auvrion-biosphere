/**
 * AB-WC-004 second slice: Better Auth SIGNED COOKIES + PostgreSQL-backed
 * account/role/MFA guards and actual lifecycle Route Handler function.
 *
 * Uses real Better Auth signInEmail/getSession, real Drizzle/PostgreSQL,
 * and a mock ONLY for Next's request-scoped `headers()` context + db provider.
 * This is NOT a network/Playwright test or a TOTP-challenge E2E test.
 *
 * Opt-in, strictly restricted to the isolated 127.0.0.1:5434 database.
 */
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { accessLifecycleAudit } from "@/server/db/access-lifecycle-audit-schema";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import { account, session, user } from "@/server/db/auth-schema";
import {
  adminCapabilityGrants,
  organizations,
  roleGrants,
} from "@/server/db/grants-schema";
import { mfaSessionAssurance } from "@/server/db/mfa-assurance-schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requestCookie: "",
}));

// Mock ONLY request scoping. Do NOT mock auth.api.getSession, signInEmail,
// getCurrentSession, checkAccountAccess or authorization guards.
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ getDb: mocks.getDb }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: mocks.requestCookie }),
}));

const ENABLED = process.env.RUN_AUTH_SESSION_DB_TESTS === "YES";
const ORIGIN = "http://localhost:3000";
const PASSWORD = `Wc004-Test-Only-${randomUUID()}-#1`;
const REASON = "WC004 real signed session lifecycle acceptance test";

type Role = "operator" | "supervisor" | "ranger";
type Capability = "manage_access" | "review_applications";
type Fixture = {
  userId: string;
  applicationId: string;
  email: string;
  role: Role | null;
};

function isolatedUrl(): string {
  loadEnvFile(".env.local");
  const source = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (
    !["postgres:", "postgresql:"].includes(source.protocol) ||
    source.hostname !== "127.0.0.1" ||
    source.port !== "5433" ||
    source.pathname !== "/auvrion_dev" ||
    decodeURIComponent(source.username) !== "auvrion_dev"
  ) {
    throw new Error("WC004_REFUSING_UNEXPECTED_DEV_URL");
  }
  source.port = "5434";
  source.pathname = "/auvrion_wc004_test";
  if (
    source.hostname !== "127.0.0.1" ||
    source.port !== "5434" ||
    source.pathname !== "/auvrion_wc004_test"
  ) {
    throw new Error("WC004_REFUSING_NONISOLATED_DATABASE");
  }
  return source.toString();
}

describe.skipIf(!ENABLED)(
  "AB-WC-004 Better Auth signed-cookie and Route Handler DB integration",
  () => {
    let pool: Pool;
    let db: ReturnType<typeof drizzle>;
    let orgId: string;
    let actorId: string;
    let auth: typeof import("@/server/auth").auth;
    let checkOperationalAccess: typeof import("./operational-access").checkOperationalAccess;
    let checkAdminAccess: typeof import("./admin-access").checkAdminAccess;
    let getCurrentSession: typeof import("@/server/auth/session").getCurrentSession;
    let getMe: typeof import("@/app/api/me/route").GET;
    let lifecyclePost: typeof import("@/app/api/admin/access-users/[id]/lifecycle/route").POST;
    let hashPassword: typeof import("better-auth/crypto").hashPassword;
    const fixtures: Fixture[] = [];
    const credentialIds: string[] = [];

    beforeAll(async () => {
      const connectionString = isolatedUrl();
      if (
        !process.env.BETTER_AUTH_SECRET ||
        process.env.BETTER_AUTH_SECRET.length < 32
      ) {
        throw new Error("WC004_REQUIRES_LOCAL_BETTER_AUTH_SECRET");
      }
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

      // Dynamic imports ensure Better Auth reads the isolated test configuration.
      ({ auth } = await import("@/server/auth"));
      ({ hashPassword } = await import("better-auth/crypto"));
      ({ getCurrentSession } = await import("@/server/auth/session"));
      ({ checkOperationalAccess } = await import("./operational-access"));
      ({ checkAdminAccess } = await import("./admin-access"));
      ({ GET: getMe } = await import("@/app/api/me/route"));
      ({ POST: lifecyclePost } = await import(
        "@/app/api/admin/access-users/[id]/lifecycle/route"
      ));

      // AUVRION-LOCAL is created ONLY in the dedicated test database.
      const [existing] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.code, "AUVRION-LOCAL"))
        .limit(1);
      if (existing) {
        throw new Error("WC004_TEST_ORG_ALREADY_EXISTS_REFUSING_SHARED_DB");
      }
      orgId = randomUUID();
      await db.insert(organizations).values({
        id: orgId,
        code: "AUVRION-LOCAL",
        name: "WC004 Isolated Local Test Organization",
      });
      actorId = `wc004-http-actor-${randomUUID()}`;
      await db.insert(user).values({
        id: actorId,
        name: "WC004 Synthetic Grant Actor",
        email: `${actorId}@example.invalid`,
        emailVerified: true,
      });
    }, 30000);

    async function makeUser(
      options: { role?: Role | null; capability?: Capability } = {},
    ): Promise<Fixture> {
      const userId = `wc004-http-user-${randomUUID()}`;
      const applicationId = randomUUID();
      const credentialId = `wc004-http-credential-${randomUUID()}`;
      const email = `${userId}@example.invalid`;
      const role = options.role ?? null;
      const fixture: Fixture = { userId, applicationId, email, role };
      fixtures.push(fixture);
      credentialIds.push(credentialId);
      const now = new Date();
      await db.insert(user).values({
        id: userId,
        name: "WC004 Signed Cookie User",
        email,
        emailVerified: true,
        twoFactorEnabled: false,
      });
      await db.insert(account).values({
        id: credentialId,
        accountId: userId,
        providerId: "credential",
        userId,
        password: await hashPassword(PASSWORD),
      });
      await db.insert(accessApplications).values({
        id: applicationId,
        applicantName: "WC004 Signed Cookie User",
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
      if (role) {
        await db.insert(roleGrants).values({
          userId,
          organizationId: orgId,
          role,
          grantedById: actorId,
        });
      }
      if (options.capability) {
        await db.insert(adminCapabilityGrants).values({
          userId,
          organizationId: orgId,
          capability: options.capability,
          grantedById: actorId,
        });
      }
      return fixture;
    }

    async function signIn(
      fixture: Fixture,
    ): Promise<{ cookie: string; sessionId: string }> {
      const response = await auth.api.signInEmail({
        body: { email: fixture.email, password: PASSWORD },
        headers: new Headers({ Origin: ORIGIN }),
        asResponse: true,
      });
      expect(response.status).toBe(200);
      // Retain the server-issued, signed cookie; NEVER construct our own token.
      const cookies = response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .filter((value) => value.includes("session_token="));
      expect(cookies).toHaveLength(1);
      const cookie = cookies[0];
      mocks.requestCookie = cookie;
      const verified = await auth.api.getSession({
        headers: new Headers({ cookie }),
      });
      expect(verified?.user.id).toBe(fixture.userId);
      const [saved] = await db
        .select({ id: session.id })
        .from(session)
        .where(eq(session.userId, fixture.userId))
        .limit(1);
      expect(saved?.id).toBeTruthy();
      return { cookie, sessionId: saved.id };
    }

    async function assure(
      fixture: Fixture,
      sessionId: string,
      expiresAt?: Date,
    ) {
      await db.insert(mfaSessionAssurance).values({
        sessionId,
        userId: fixture.userId,
        verifiedAt: new Date(),
        expiresAt: expiresAt ?? new Date(Date.now() + 20 * 60_000),
      });
    }

    function actOn(
      targetUserId: string,
      cookie: string,
      action = "revoke_role",
    ) {
      mocks.requestCookie = cookie;
      return lifecyclePost(
        new Request(
          `${ORIGIN}/api/admin/access-users/${targetUserId}/lifecycle`,
          {
            method: "POST",
            headers: {
              Origin: ORIGIN,
              "Content-Type": "application/json",
              cookie,
            },
            body: JSON.stringify({
              action,
              reason: REASON,
              expectedLifecycleAuditId: null,
            }),
          },
        ),
        { params: Promise.resolve({ id: targetUserId }) },
      );
    }

    it("treats missing and forged signed cookies as unauthenticated", async () => {
      mocks.requestCookie = "";
      expect((await getMe()).status).toBe(401);
      mocks.requestCookie =
        "better-auth.session_token=forged.invalid.signature";
      expect(await getCurrentSession()).toBeNull();
      expect((await getMe()).status).toBe(401);
    });

    it("validates actual Better Auth cookie, exposes /api/me and checks MFA gate", async () => {
      const fixture = await makeUser({ role: "operator" });
      const { sessionId, cookie } = await signIn(fixture);
      expect((await getCurrentSession())?.user.id).toBe(fixture.userId);
      const me = await getMe();
      expect(me.status).toBe(200);
      expect((await me.json()) as { user: { id: string } }).toMatchObject({
        user: { id: fixture.userId },
      });
      expect(await checkOperationalAccess(orgId, "operator")).toEqual({
        allowed: false,
        status: 403,
        reason: "MFA_ASSURANCE_REQUIRED",
      });
      await assure(fixture, sessionId);
      expect(await checkOperationalAccess(orgId, "operator")).toEqual({
        allowed: true,
        userId: fixture.userId,
        organizationId: orgId,
        role: "operator",
      });
      mocks.requestCookie = `${cookie}x`;
      expect(await getCurrentSession()).toBeNull();
    });

    it("denies wrong role and revoked grant even with a valid signed session", async () => {
      const fixture = await makeUser({ role: "operator" });
      const { sessionId } = await signIn(fixture);
      await assure(fixture, sessionId);
      expect(await checkOperationalAccess(orgId, "supervisor")).toMatchObject({
        allowed: false,
        reason: "ROLE_OR_SCOPE_DENIED",
      });
      await db
        .update(roleGrants)
        .set({ revokedAt: new Date(), revokedById: actorId })
        .where(
          and(
            eq(roleGrants.userId, fixture.userId),
            isNull(roleGrants.revokedAt),
          ),
        );
      expect((await getCurrentSession())?.user.id).toBe(fixture.userId);
      expect(await checkOperationalAccess(orgId, "operator")).toEqual({
        allowed: false,
        status: 403,
        reason: "ROLE_OR_SCOPE_DENIED",
      });
      // A new real password login cannot restore a revoked operational grant.
      await signIn(fixture);
      expect(await checkOperationalAccess(orgId, "operator")).toEqual({
        allowed: false,
        status: 403,
        reason: "ROLE_OR_SCOPE_DENIED",
      });
    });

    it("denies sessions whose DB row has expired or has been revoked", async () => {
      const fixture = await makeUser({ role: "ranger" });
      const { sessionId, cookie } = await signIn(fixture);
      await assure(fixture, sessionId);
      await db
        .update(session)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(session.id, sessionId));
      mocks.requestCookie = cookie;
      expect(await getCurrentSession()).toBeNull();
      expect((await getMe()).status).toBe(401);
      await db.delete(session).where(eq(session.id, sessionId));
      expect(await getCurrentSession()).toBeNull();
    });

    it("denies expired server MFA assurance with otherwise valid cookie", async () => {
      const fixture = await makeUser({ role: "supervisor" });
      const { sessionId } = await signIn(fixture);
      await assure(fixture, sessionId, new Date(Date.now() - 60_000));
      expect(await checkOperationalAccess(orgId, "supervisor")).toEqual({
        allowed: false,
        status: 403,
        reason: "MFA_ASSURANCE_REQUIRED",
      });
    });

    it("rejects operator-signed cookie on real admin lifecycle Route Handler", async () => {
      const operator = await makeUser({ role: "operator" });
      const target = await makeUser({ role: "ranger" });
      const { sessionId, cookie } = await signIn(operator);
      await assure(operator, sessionId);
      const response = await actOn(target.userId, cookie);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "ADMIN_CAPABILITY_DENIED",
      });
      const [active] = await db
        .select({ id: roleGrants.id })
        .from(roleGrants)
        .where(
          and(
            eq(roleGrants.userId, target.userId),
            isNull(roleGrants.revokedAt),
          ),
        )
        .limit(1);
      expect(active).toBeDefined();
    });

    it("denies admin lifecycle request with no valid MFA assurance", async () => {
      const admin = await makeUser({ capability: "manage_access" });
      const target = await makeUser({ role: "operator" });
      const { cookie } = await signIn(admin);
      const response = await actOn(target.userId, cookie);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "MFA_ASSURANCE_REQUIRED",
      });
    });

    it("admin with valid signed session and assurance revokes target role and session", async () => {
      const admin = await makeUser({ capability: "manage_access" });
      const target = await makeUser({ role: "operator" });
      const { sessionId: adminSession, cookie: adminCookie } =
        await signIn(admin);
      await assure(admin, adminSession);
      const { sessionId: targetSession, cookie: targetCookie } =
        await signIn(target);
      await assure(target, targetSession);
      expect(await checkAdminAccess(orgId, "manage_access")).toEqual({
        allowed: false,
        status: 403,
        reason: "ADMIN_CAPABILITY_DENIED",
      });
      // Switch request context to real admin's cookie.
      const response = await actOn(target.userId, adminCookie);
      expect(response.status).toBe(200);
      expect((await response.json()) as { outcome: string }).toEqual({
        outcome: "role_revoked",
      });
      const roles = await db
        .select({ id: roleGrants.id })
        .from(roleGrants)
        .where(
          and(
            eq(roleGrants.userId, target.userId),
            isNull(roleGrants.revokedAt),
          ),
        );
      expect(roles).toHaveLength(0);
      const sessions = await db
        .select({ id: session.id })
        .from(session)
        .where(eq(session.userId, target.userId));
      expect(sessions).toHaveLength(0);
      const assurance = await db
        .select({ sessionId: mfaSessionAssurance.sessionId })
        .from(mfaSessionAssurance)
        .where(eq(mfaSessionAssurance.userId, target.userId));
      expect(assurance).toHaveLength(0);
      mocks.requestCookie = targetCookie;
      expect(await getCurrentSession()).toBeNull();
      expect((await getMe()).status).toBe(401);
      mocks.requestCookie = adminCookie;
      expect(await checkAdminAccess(orgId, "manage_access")).toMatchObject({
        allowed: true,
        userId: admin.userId,
      });
      const audit = await db
        .select({ action: accessLifecycleAudit.action })
        .from(accessLifecycleAudit)
        .where(eq(accessLifecycleAudit.targetUserId, target.userId));
      expect(audit).toEqual([{ action: "role_revoked" }]);
    }, 20000);

    it("refuses lifecycle POST from forged cookie, before any target change", async () => {
      const target = await makeUser({ role: "ranger" });
      const response = await actOn(
        target.userId,
        "better-auth.session_token=fake.token",
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "UNAUTHENTICATED" });
      const rows = await db
        .select()
        .from(roleGrants)
        .where(
          and(
            eq(roleGrants.userId, target.userId),
            isNull(roleGrants.revokedAt),
          ),
        );
      expect(rows).toHaveLength(1);
    });

    afterAll(async () => {
      try {
        if (!db) return;
        const userIds = fixtures.map((fixture) => fixture.userId);
        const appIds = fixtures.map((fixture) => fixture.applicationId);
        if (userIds.length > 0) {
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
            .delete(adminCapabilityGrants)
            .where(inArray(adminCapabilityGrants.userId, userIds));
          await db.delete(account).where(inArray(account.id, credentialIds));
          await db
            .delete(userAccess)
            .where(inArray(userAccess.userId, userIds));
          await db
            .delete(accessApplications)
            .where(inArray(accessApplications.id, appIds));
          await db.delete(user).where(inArray(user.id, userIds));
        }
        if (actorId) await db.delete(user).where(eq(user.id, actorId));
        if (orgId)
          await db.delete(organizations).where(eq(organizations.id, orgId));
      } finally {
        if (pool) await pool.end();
        mocks.requestCookie = "";
        vi.unstubAllEnvs();
      }
    }, 20000);
  },
);
