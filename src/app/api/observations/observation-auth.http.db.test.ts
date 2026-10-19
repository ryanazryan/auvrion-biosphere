/**
 * AB-WC-008 Slice 03: signed Better Auth cookie + real operational guards,
 * PostgreSQL and observation Route Handler function integration.
 *
 * Only `getDb` (pointed at isolated Postgres) and Next's request-scoped
 * `headers()` are adapted. Auth APIs, account/MFA/role guards, observation
 * services and HTTP Route Handler functions are NOT mocked.
 *
 * This is a handler-level integration test, NOT a network/Playwright test.
 * An MFA assurance row is inserted as a test fixture; it does NOT prove
 * that an actual TOTP login challenge was executed.
 *
 * Opt-in only: RUN_WC008_HTTP_DB_TESTS=YES. Database MUST be
 * 127.0.0.1:5435/auvrion_wc007_test, derived from known local dev identity.
 */
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { accessApplications, userAccess } from "@/server/db/access-schema";
import { account, session, user } from "@/server/db/auth-schema";
import {
  adminCapabilityGrants,
  organizations,
  roleGrants,
} from "@/server/db/grants-schema";
import { mfaSessionAssurance } from "@/server/db/mfa-assurance-schema";
import {
  environmentalMeasurements,
  observationProvenance,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";

const adapter = vi.hoisted(() => ({
  getDb: vi.fn(),
  cookie: "",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ getDb: adapter.getDb }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: adapter.cookie }),
}));

const ENABLED = process.env.RUN_WC008_HTTP_DB_TESTS === "YES";
const ORIGIN = "http://localhost:3000";
const PASSWORD = `WC008-Http-Only-${randomUUID()}-#1`;

type Db = ReturnType<typeof drizzle>;
type Role = "operator" | "supervisor" | "ranger";
type Persona = {
  userId: string;
  applicationId: string;
  credentialId: string;
  email: string;
  cookie: string;
  sessionId: string;
};

type CreatePayload = {
  organizationId: string;
  sourceId: string;
  sourceRecordId: string;
  domain: "biodiversity" | "environmental_risk";
  ingestionMode: "historical";
  observedAt: string;
  latitude?: number;
  longitude?: number;
  locationUnknownReason?: string | null;
  provenance?: { attribution?: string };
};

function isolatedDatabaseUrl(): string {
  loadEnvFile(".env.local");
  const dev = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (
    !["postgres:", "postgresql:"].includes(dev.protocol) ||
    dev.hostname !== "127.0.0.1" ||
    dev.port !== "5433" ||
    dev.pathname !== "/auvrion_dev" ||
    decodeURIComponent(dev.username) !== "auvrion_dev"
  ) {
    throw new Error("WC008_HTTP_REFUSING_UNEXPECTED_DEV_DATABASE_URL");
  }
  const test = new URL(dev);
  test.port = "5435";
  test.pathname = "/auvrion_wc007_test";
  if (
    test.hostname !== "127.0.0.1" ||
    test.port !== "5435" ||
    test.pathname !== "/auvrion_wc007_test"
  ) {
    throw new Error("WC008_HTTP_REFUSING_NONISOLATED_DATABASE");
  }
  return test.toString();
}

describe.skipIf(!ENABLED)(
  "AB-WC-008 signed-session observation Route Handler + PostgreSQL",
  () => {
    let pool: Pool | undefined;
    let db: Db;
    let auth: typeof import("@/server/auth").auth;
    let routePost: typeof import("./route").POST;
    let routeList: typeof import("./route").GET;
    let routeDetail: typeof import("./[id]/route").GET;
    let hashPassword: typeof import("better-auth/crypto").hashPassword;

    const orgA = randomUUID();
    const orgB = randomUUID();
    const sourceA = randomUUID();
    const sourceB = randomUUID();
    const actorId = `wc008-http-actor-${randomUUID()}`;
    const personas: Persona[] = [];
    const users: Record<string, Persona> = {};

    async function makePersona(
      options: {
        role?: Role;
        organizationId?: string;
        adminOnly?: boolean;
      } = {},
    ): Promise<Persona> {
      const userId = `wc008-http-user-${randomUUID()}`;
      const applicationId = randomUUID();
      const credentialId = `wc008-http-credential-${randomUUID()}`;
      const email = `${userId}@example.invalid`;
      const persona: Persona = {
        userId,
        applicationId,
        credentialId,
        email,
        cookie: "",
        sessionId: "",
      };
      personas.push(persona); // Track all IDs, even if a later fixture insert fails.
      const now = new Date();
      await db.insert(user).values({
        id: userId,
        name: "WC008 HTTP Synthetic User",
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
        applicantName: "WC008 HTTP Synthetic User",
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
      if (options.role) {
        await db.insert(roleGrants).values({
          userId,
          organizationId: options.organizationId ?? orgA,
          role: options.role,
          grantedById: actorId,
        });
      }
      if (options.adminOnly) {
        await db.insert(adminCapabilityGrants).values({
          userId,
          organizationId: orgA,
          capability: "manage_access",
          grantedById: actorId,
        });
      }
      const response = await auth.api.signInEmail({
        body: { email, password: PASSWORD },
        headers: new Headers({ Origin: ORIGIN }),
        asResponse: true,
      });
      expect(response.status).toBe(200);
      const cookies = response.headers
        .getSetCookie()
        .map((header) => header.split(";")[0])
        .filter((item) => item.includes("session_token="));
      expect(cookies).toHaveLength(1);
      persona.cookie = cookies[0];
      const verified = await auth.api.getSession({
        headers: new Headers({ cookie: persona.cookie }),
      });
      expect(verified?.user.id).toBe(userId);
      persona.sessionId = verified?.session.id ?? "";
      expect(persona.sessionId).toBeTruthy();
      return persona;
    }

    async function assure(persona: Persona, expiresAt?: Date) {
      await db.insert(mfaSessionAssurance).values({
        sessionId: persona.sessionId,
        userId: persona.userId,
        verifiedAt: new Date(),
        expiresAt: expiresAt ?? new Date(Date.now() + 20 * 60_000),
      });
    }

    function payload(
      organizationId = orgA,
      sourceId = sourceA,
      extras: Partial<CreatePayload> = {},
    ): CreatePayload {
      return {
        organizationId,
        sourceId,
        sourceRecordId: `wc008-http-${randomUUID()}`,
        domain: "biodiversity",
        ingestionMode: "historical",
        observedAt: "2026-10-18T08:00:00+08:00",
        locationUnknownReason: "test-location-unknown",
        ...extras,
      };
    }

    async function post(cookie: string, body: unknown) {
      adapter.cookie = cookie;
      return routePost(
        new Request(`${ORIGIN}/api/observations`, {
          method: "POST",
          headers: {
            Origin: ORIGIN,
            "Content-Type": "application/json",
            cookie,
          },
          body: JSON.stringify(body),
        }),
      );
    }

    async function list(cookie: string, organizationId = orgA, query = "") {
      adapter.cookie = cookie;
      const url = `${ORIGIN}/api/observations?organizationId=${organizationId}${query}`;
      return routeList(new Request(url, { headers: { cookie } }));
    }

    async function detail(cookie: string, organizationId: string, id: string) {
      adapter.cookie = cookie;
      const url = `${ORIGIN}/api/observations/${id}?organizationId=${organizationId}`;
      return routeDetail(new Request(url, { headers: { cookie } }), {
        params: Promise.resolve({ id }),
      });
    }

    beforeAll(async () => {
      const connectionString = isolatedDatabaseUrl();
      if (
        !process.env.BETTER_AUTH_SECRET ||
        process.env.BETTER_AUTH_SECRET.length < 32
      ) {
        throw new Error("WC008_HTTP_REQUIRES_LOCAL_BETTER_AUTH_SECRET");
      }
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
      vi.stubEnv("ENABLE_LOCAL_ACCESS_REQUESTS", "YES");
      pool = new Pool({
        connectionString,
        max: 5,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 1000,
      });
      const identity = await pool.query(
        "SELECT current_database() AS name, current_user AS username, inet_server_port() AS server_port",
      );
      if (
        identity.rows[0]?.name !== "auvrion_wc007_test" ||
        identity.rows[0]?.username !== "auvrion_dev"
      ) {
        throw new Error("WC008_HTTP_REFUSING_UNEXPECTED_DATABASE_IDENTITY");
      }
      db = drizzle({ client: pool });
      adapter.getDb.mockReturnValue(db);

      // Import after environment and test DB adapter are established.
      ({ auth } = await import("@/server/auth"));
      ({ hashPassword } = await import("better-auth/crypto"));
      ({ POST: routePost, GET: routeList } = await import("./route"));
      ({ GET: routeDetail } = await import("./[id]/route"));

      await db.insert(organizations).values([
        { id: orgA, code: `WC008-HTTP-A-${orgA}`, name: "WC008 HTTP Org A" },
        { id: orgB, code: `WC008-HTTP-B-${orgB}`, name: "WC008 HTTP Org B" },
      ]);
      await db.insert(user).values({
        id: actorId,
        name: "WC008 HTTP Synthetic Grant Actor",
        email: `${actorId}@example.invalid`,
        emailVerified: true,
      });
      await db.insert(observationSources).values([
        {
          id: sourceA,
          organizationId: orgA,
          kind: "manual",
          code: "WC008-HTTP-A",
          label: "WC008 Manual A",
          isActive: true,
        },
        {
          id: sourceB,
          organizationId: orgB,
          kind: "manual",
          code: "WC008-HTTP-B",
          label: "WC008 Manual B",
          isActive: true,
        },
      ]);

      users.operator = await makePersona({
        role: "operator",
        organizationId: orgA,
      });
      users.supervisor = await makePersona({
        role: "supervisor",
        organizationId: orgA,
      });
      users.ranger = await makePersona({
        role: "ranger",
        organizationId: orgA,
      });
      users.otherOperator = await makePersona({
        role: "operator",
        organizationId: orgB,
      });
      users.unassured = await makePersona({
        role: "operator",
        organizationId: orgA,
      });
      users.admin = await makePersona({ adminOnly: true });
      users.disabled = await makePersona({
        role: "operator",
        organizationId: orgA,
      });
      users.revoked = await makePersona({
        role: "operator",
        organizationId: orgA,
      });

      await Promise.all([
        assure(users.operator),
        assure(users.supervisor),
        assure(users.ranger),
        assure(users.otherOperator),
        assure(users.admin),
        assure(users.disabled),
        assure(users.revoked),
      ]);
    }, 90000);

    it("denies unsigned and forged cookies before writing or listing observations", async () => {
      const sample = payload();
      for (const cookie of [
        "",
        "better-auth.session_token=forged.invalid.signature",
      ]) {
        expect((await post(cookie, sample)).status).toBe(401);
        expect((await list(cookie)).status).toBe(401);
      }
      expect(
        await db
          .select()
          .from(observations)
          .where(eq(observations.sourceRecordId, sample.sourceRecordId)),
      ).toHaveLength(0);
    });

    it("requires current session MFA assurance for POST and GET", async () => {
      expect((await post(users.unassured.cookie, payload())).status).toBe(403);
      const denied = await list(users.unassured.cookie);
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ error: "MFA_ASSURANCE_REQUIRED" });
    });

    it("allows MFA-assured operator POST, then scoped list/detail with no sensitive coordinates", async () => {
      const submitted = payload(orgA, sourceA, {
        latitude: -2.5,
        longitude: 114.4,
        locationUnknownReason: null,
      });
      const created = await post(users.operator.cookie, submitted);
      expect(created.status).toBe(201);
      expect(created.headers.get("cache-control")).toBe("no-store");
      expect(created.headers.get("vary")).toContain("Cookie");
      const result = (await created.json()) as {
        id: string;
        replayed: boolean;
      };
      expect(result.replayed).toBe(false);
      const listed = await list(
        users.operator.cookie,
        orgA,
        "&domain=biodiversity&limit=25",
      );
      expect(listed.status).toBe(200);
      expect(listed.headers.get("cache-control")).toBe("no-store");
      const listBody = (await listed.json()) as {
        total: number;
        items: Array<{ id: string }>;
      };
      expect(listBody.total).toBeGreaterThanOrEqual(1);
      expect(listBody.items.map((item) => item.id)).toContain(result.id);
      const detailed = await detail(users.operator.cookie, orgA, result.id);
      expect(detailed.status).toBe(200);
      const body = (await detailed.json()) as {
        observation: Record<string, unknown>;
      };
      expect(body.observation.id).toBe(result.id);
      expect(body.observation).not.toHaveProperty("latitude");
      expect(body.observation).not.toHaveProperty("longitude");
      expect(JSON.stringify(body)).not.toContain("114.4");
      expect(body.observation.location).toEqual({
        hasCoordinates: true,
        unknownReason: null,
      });
    });

    it("returns HTTP 200 on identical idempotent replay and 409 on changed payload", async () => {
      const submitted = payload();
      const first = await post(users.operator.cookie, submitted);
      expect(first.status).toBe(201);
      const firstResult = (await first.json()) as { id: string };
      const retry = await post(users.operator.cookie, submitted);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({
        id: firstResult.id,
        replayed: true,
      });
      const conflicting = await post(users.operator.cookie, {
        ...submitted,
        provenance: { attribution: "Different payload" },
      });
      expect(conflicting.status).toBe(409);
      expect(await conflicting.json()).toEqual({
        error: "SOURCE_RECORD_ID_CONFLICT",
      });
      const records = await db
        .select({ id: observations.id })
        .from(observations)
        .where(
          and(
            eq(observations.sourceId, sourceA),
            eq(observations.sourceRecordId, submitted.sourceRecordId),
          ),
        );
      expect(records).toHaveLength(1);
    });

    it("allows supervisor reads but denies supervisor writes", async () => {
      expect((await list(users.supervisor.cookie)).status).toBe(200);
      expect((await post(users.supervisor.cookie, payload())).status).toBe(403);
    });

    it("denies Ranger broad list/detail and writes even with MFA assurance", async () => {
      expect((await list(users.ranger.cookie)).status).toBe(403);
      expect((await post(users.ranger.cookie, payload())).status).toBe(403);
      expect(
        (await detail(users.ranger.cookie, orgA, randomUUID())).status,
      ).toBe(403);
    });

    it("does not grant operational API privileges from admin capability alone", async () => {
      expect((await list(users.admin.cookie)).status).toBe(403);
      expect((await post(users.admin.cookie, payload())).status).toBe(403);
    });

    it("denies cross-organization selectors and returns 404 for a foreign object using an authorized selector", async () => {
      const otherSubmitted = payload(orgB, sourceB, {
        domain: "environmental_risk",
      });
      const foreign = await post(users.otherOperator.cookie, otherSubmitted);
      expect(foreign.status).toBe(201);
      const foreignId = ((await foreign.json()) as { id: string }).id;
      expect((await list(users.operator.cookie, orgB)).status).toBe(403);
      expect((await list(users.otherOperator.cookie, orgA)).status).toBe(403);
      expect(
        (await post(users.operator.cookie, payload(orgB, sourceB))).status,
      ).toBe(403);
      const hidden = await detail(users.operator.cookie, orgA, foreignId);
      expect(hidden.status).toBe(404);
      expect(await hidden.json()).toEqual({ error: "NOT_FOUND" });
      const result = await list(
        users.operator.cookie,
        orgA,
        "&domain=environmental_risk&limit=1&offset=0",
      );
      expect(result.status).toBe(200);
      const own = (await result.json()) as { total: number; items: unknown[] };
      expect(own.total).toBe(0);
      expect(own.items).toHaveLength(0);
    });

    it("denies account that becomes disabled despite a valid cookie, role and assurance", async () => {
      await db
        .update(userAccess)
        .set({ status: "disabled", disabledAt: new Date() })
        .where(eq(userAccess.userId, users.disabled.userId));
      const response = await list(users.disabled.cookie);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "ACCOUNT_NOT_AUTHORIZED",
      });
    });

    it("denies a revoked role grant despite a valid cookie and assurance", async () => {
      await db
        .update(roleGrants)
        .set({ revokedAt: new Date(), revokedById: actorId })
        .where(eq(roleGrants.userId, users.revoked.userId));
      expect((await list(users.revoked.cookie)).status).toBe(403);
      expect((await post(users.revoked.cookie, payload())).status).toBe(403);
    });

    it("denies an expired MFA assurance with a valid signed session", async () => {
      await assure(users.unassured, new Date(Date.now() - 60_000));
      const response = await list(users.unassured.cookie);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "MFA_ASSURANCE_REQUIRED",
      });
    });

    it("rejects invalid observation payload and does not persist anything", async () => {
      const invalid = payload(orgA, sourceA, {
        observedAt: "2026-02-30T08:00:00+08:00",
      });
      const response = await post(users.operator.cookie, invalid);
      expect(response.status).toBe(400);
      const record = await db
        .select({ id: observations.id })
        .from(observations)
        .where(eq(observations.sourceRecordId, invalid.sourceRecordId));
      expect(record).toHaveLength(0);
    });

    afterAll(async () => {
      try {
        if (db) {
          // Strictly delete our synthetic organizations and identities, never
          // touch dev/production data or unrelated entries in the isolated DB.
          const orgIds = [orgA, orgB];
          const observationRows = await db
            .select({ id: observations.id })
            .from(observations)
            .where(inArray(observations.organizationId, orgIds));
          const observationIds = observationRows.map((item) => item.id);
          if (observationIds.length) {
            await db
              .delete(environmentalMeasurements)
              .where(
                inArray(
                  environmentalMeasurements.observationId,
                  observationIds,
                ),
              );
            await db
              .delete(observationProvenance)
              .where(
                inArray(observationProvenance.observationId, observationIds),
              );
            await db
              .delete(observations)
              .where(inArray(observations.id, observationIds));
          }
          await db
            .delete(observationSources)
            .where(inArray(observationSources.organizationId, orgIds));
          const userIds = personas.map((item) => item.userId);
          const applicationIds = personas.map((item) => item.applicationId);
          const credentialIds = personas.map((item) => item.credentialId);
          if (userIds.length) {
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
              .where(inArray(accessApplications.id, applicationIds));
            await db.delete(user).where(inArray(user.id, userIds));
          }
          await db.delete(user).where(eq(user.id, actorId));
          await db
            .delete(organizations)
            .where(inArray(organizations.id, orgIds));
        }
      } finally {
        adapter.cookie = "";
        adapter.getDb.mockReset();
        vi.unstubAllEnvs();
        await pool?.end();
      }
    }, 30000);
  },
);
