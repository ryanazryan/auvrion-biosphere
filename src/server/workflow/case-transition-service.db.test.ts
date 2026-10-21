/**
 * AB-WC-012 Slice 01B — actual transactional service DB tests.
 * RUN_WC007_DB_TESTS=YES opts in. Target: ONLY local 127.0.0.1:5435/auvrion_wc007_test.
 * Fixtures and injected failure trigger always roll back in their outer transaction.
 * Upstream signed-session/MFA access is mocked; these tests do NOT claim to test real login.
 */
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { accessApplications, userAccess } from "@/server/db/access-schema";
import { user } from "@/server/db/auth-schema";
import { organizations, roleGrants } from "@/server/db/grants-schema";
import {
  caseObservationLinks,
  domainCases,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import {
  caseTransitionEvents,
  domainTasks,
  operationalZones,
  taskAssignments,
} from "@/server/db/operations-domain-schema";

const harness = vi.hoisted(() => ({ tx: null as unknown, actor: "" }));
// Avoid live HTTP session / MFA in DB integration tests; separately test that boundary.
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ getDb: () => harness.tx }));
vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: async (organizationId: string, role: string) => ({
    allowed: true,
    userId: harness.actor,
    organizationId,
    role,
  }),
}));

import { transitionApprovedCase } from "./case-transition-service";

type Db = ReturnType<typeof drizzle>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type Fixture = {
  tx: Tx;
  orgA: string;
  orgB: string;
  operatorId: string;
  supervisorId: string;
  rangerId: string;
  otherRangerId: string;
  caseId: string;
  observationId: string;
  zoneA: string;
  zoneB: string;
};

function connectionStringForIsolatedTest() {
  loadEnvFile(".env.local");
  const dev = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (
    !["postgres:", "postgresql:"].includes(dev.protocol) ||
    dev.hostname !== "127.0.0.1" ||
    dev.port !== "5433" ||
    dev.pathname !== "/auvrion_dev" ||
    decodeURIComponent(dev.username) !== "auvrion_dev"
  ) {
    throw new Error("WC012_REFUSED_NONCANONICAL_DEV_DB_URL");
  }
  dev.port = "5435";
  dev.pathname = "/auvrion_wc007_test";
  return dev.toString();
}

function command(
  f: Fixture,
  transitionId: "AB-TR-010" | "AB-TR-011" | "AB-TR-012" | "AB-TR-013",
  expectedVersion: number,
) {
  return {
    organizationId: f.orgA,
    caseId: f.caseId,
    requestId: randomUUID(),
    transitionId,
    expectedVersion,
    reason: `WC012 verified human rationale for ${transitionId}`,
  };
}

function rangerAssignment(f: Fixture) {
  return {
    rangerUserId: f.rangerId,
    zoneId: f.zoneA,
    title: "Verify PM anomaly in assigned zone",
    instructions: "Review sensor context and report observations safely",
    safetyNotes: "Stop if weather or ground conditions are unsafe",
  };
}

const ENABLED = process.env.RUN_WC007_DB_TESTS === "YES";

describe.skipIf(!ENABLED)(
  "WC-012 approved Case service — isolated real PostgreSQL",
  () => {
    let pool: Pool;
    let db: Db;

    beforeAll(async () => {
      pool = new Pool({
        connectionString: connectionStringForIsolatedTest(),
        max: 2,
        connectionTimeoutMillis: 5000,
      });
      db = drizzle({ client: pool });
      const { rows } = await pool.query(
        "SELECT current_database() AS db, EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS postgis, to_regclass('public.case_transition_events') IS NOT NULL AS has_ledger",
      );
      if (
        rows[0]?.db !== "auvrion_wc007_test" ||
        rows[0]?.postgis !== true ||
        rows[0]?.has_ledger !== true
      ) {
        throw new Error("WC012_REFUSED_UNMIGRATED_OR_UNSAFE_TEST_DATABASE");
      }
    }, 20000);

    afterAll(async () => {
      await pool?.end();
    }, 20000);

    /**
     * The real service starts a nested Drizzle transaction (SAVEPOINT). Throwing
     * ROLLBACK_MARKER from outer tx guarantees fixture and trigger cleanup.
     */
    async function isolated(run: (f: Fixture) => Promise<void>) {
      const rollbackMarker = new Error("WC012_EXPECTED_FIXTURE_ROLLBACK");
      let error: unknown;
      try {
        await db.transaction(async (tx) => {
          harness.tx = tx;
          try {
            const f = await seed(tx);
            await run(f);
          } catch (cause) {
            error = cause;
          }
          throw rollbackMarker;
        });
      } catch (cause) {
        if (cause !== rollbackMarker) throw cause;
      } finally {
        harness.tx = null;
        harness.actor = "";
      }
      if (error) throw error;
    }

    async function seed(tx: Tx): Promise<Fixture> {
      const orgA = randomUUID();
      const orgB = randomUUID();
      const operatorId = `wc012-operator-${randomUUID()}`;
      const supervisorId = `wc012-supervisor-${randomUUID()}`;
      const rangerId = `wc012-ranger-${randomUUID()}`;
      const otherRangerId = `wc012-other-ranger-${randomUUID()}`;
      const caseId = randomUUID();
      const observationId = randomUUID();
      const sourceId = randomUUID();
      const zoneA = randomUUID();
      const zoneB = randomUUID();
      const people = [operatorId, supervisorId, rangerId, otherRangerId].map(
        (id) => ({
          id,
          name: id,
          email: `${id}@example.invalid`,
          emailVerified: true,
        }),
      );
      await tx.insert(organizations).values([
        { id: orgA, code: `WC012-${orgA}`, name: "WC012 Test A" },
        { id: orgB, code: `WC012-${orgB}`, name: "WC012 Test B" },
      ]);
      await tx.insert(user).values(people);
      const applications = people.map((person) => ({
        id: randomUUID(),
        applicantName: person.name,
        email: person.email,
        status: "approved" as const,
        emailVerifiedAt: new Date(),
        reviewedAt: new Date(),
        reviewedById: supervisorId,
      }));
      await tx.insert(accessApplications).values(applications);
      await tx.insert(userAccess).values(
        people.map((person, i) => {
          const application = applications[i];

          if (!application) {
            throw new Error("WC012_TEST_APPLICATION_FIXTURE_MISSING");
          }

          return {
            userId: person.id,
            applicationId: application.id,
            status: "active" as const,
          };
        }),
      );
      await tx.insert(roleGrants).values([
        {
          userId: operatorId,
          organizationId: orgA,
          role: "operator",
          grantedById: supervisorId,
        },
        {
          userId: supervisorId,
          organizationId: orgA,
          role: "supervisor",
          grantedById: supervisorId,
        },
        {
          userId: rangerId,
          organizationId: orgA,
          role: "ranger",
          grantedById: supervisorId,
        },
        {
          userId: otherRangerId,
          organizationId: orgB,
          role: "ranger",
          grantedById: supervisorId,
        },
      ]);
      await tx.insert(observationSources).values({
        id: sourceId,
        organizationId: orgA,
        kind: "prevent_device",
        code: "WC012-PREVENT",
        label: "WC012 Test Sensor",
      });
      await tx.insert(observations).values({
        id: observationId,
        organizationId: orgA,
        sourceId,
        domain: "environmental_risk",
        ingestionMode: "simulation",
        observedAt: new Date(),
        locationUnknownReason: "No exact location in test fixture",
      });
      await tx.insert(domainCases).values({
        id: caseId,
        organizationId: orgA,
        title: "Investigate PM reading",
        openedByUserId: operatorId,
      });
      await tx.insert(caseObservationLinks).values({
        caseId,
        observationId,
        organizationId: orgA,
        linkedByUserId: operatorId,
        linkReason: "Review simulation evidence",
      });
      await tx.insert(operationalZones).values([
        {
          id: zoneA,
          organizationId: orgA,
          code: "ZONE-A",
          name: "Test Zone A",
        },
        {
          id: zoneB,
          organizationId: orgB,
          code: "ZONE-B",
          name: "Test Zone B",
        },
      ]);
      harness.actor = operatorId;
      return {
        tx,
        orgA,
        orgB,
        operatorId,
        supervisorId,
        rangerId,
        otherRangerId,
        caseId,
        observationId,
        zoneA,
        zoneB,
      };
    }

    async function send(
      f: Fixture,
      transitionId: "AB-TR-010" | "AB-TR-011" | "AB-TR-012" | "AB-TR-013",
      version: number,
      assignment?: ReturnType<typeof rangerAssignment>,
    ) {
      harness.actor =
        transitionId === "AB-TR-010" || transitionId === "AB-TR-011"
          ? f.operatorId
          : f.supervisorId;
      return transitionApprovedCase({
        ...command(f, transitionId, version),
        ...(assignment ? { assignment } : {}),
      });
    }

    async function reachDecision(f: Fixture) {
      await send(f, "AB-TR-010", 1);
      await send(f, "AB-TR-011", 2);
    }

    it("AB-TR-010/011/013 persists ordered ledger and exactly one ranger task+assignment", async () => {
      await isolated(async (f) => {
        expect((await send(f, "AB-TR-010", 1)).status).toBe("under_review");
        expect((await send(f, "AB-TR-011", 2)).status).toBe(
          "awaiting_decision",
        );
        const assigned = await send(f, "AB-TR-013", 3, rangerAssignment(f));
        expect(assigned).toMatchObject({
          status: "assigned",
          version: 4,
          replayed: false,
        });
        expect(assigned.taskId).toEqual(expect.any(String));
        const [caseRow] = await f.tx
          .select()
          .from(domainCases)
          .where(eq(domainCases.id, f.caseId));
        expect(caseRow).toMatchObject({ status: "assigned", version: 4 });
        const events = await f.tx
          .select()
          .from(caseTransitionEvents)
          .where(eq(caseTransitionEvents.caseId, f.caseId))
          .orderBy(caseTransitionEvents.toVersion);
        expect(
          events.map((e) => [e.transitionId, e.fromVersion, e.toVersion]),
        ).toEqual([
          ["AB-TR-010", 1, 2],
          ["AB-TR-011", 2, 3],
          ["AB-TR-013", 3, 4],
        ]);
        const taskId = assigned.taskId;

        if (!taskId) {
          throw new Error("WC012_TEST_EXPECTED_ASSIGNED_TASK");
        }

        const [task] = await f.tx
          .select()
          .from(domainTasks)
          .where(eq(domainTasks.id, taskId));

        const assignees = await f.tx
          .select()
          .from(taskAssignments)
          .where(eq(taskAssignments.taskId, taskId));
        expect(task?.instructions).toContain("ZONE-A");
        expect(task?.safetyNotes).toContain("Stop if weather");
        expect(assignees).toHaveLength(1);
        expect(assignees[0]?.rangerUserId).toBe(f.rangerId);
      });
    });

    it("AB-TR-012 monitors without creating a task", async () => {
      await isolated(async (f) => {
        await reachDecision(f);
        const result = await send(f, "AB-TR-012", 3);
        expect(result).toMatchObject({
          status: "monitoring",
          version: 4,
          taskId: null,
        });
        expect(
          await f.tx
            .select()
            .from(domainTasks)
            .where(eq(domainTasks.caseId, f.caseId)),
        ).toHaveLength(0);
      });
    });

    it("repeated requestId is idempotent; changed input with same requestId is rejected", async () => {
      await isolated(async (f) => {
        const cmd = command(f, "AB-TR-010", 1);
        const first = await transitionApprovedCase(cmd);
        const replay = await transitionApprovedCase(cmd);
        expect(first).toMatchObject({ version: 2, replayed: false });
        expect(replay).toMatchObject({ version: 2, replayed: true });
        await expect(
          transitionApprovedCase({ ...cmd, reason: `${cmd.reason} changed` }),
        ).rejects.toMatchObject({
          status: 409,
          code: "REQUEST_ID_REUSED_WITH_DIFFERENT_DATA",
        });
        expect(
          await f.tx
            .select()
            .from(caseTransitionEvents)
            .where(eq(caseTransitionEvents.caseId, f.caseId)),
        ).toHaveLength(1);
      });
    });

    it("replayed Ranger assignment cannot be changed under same requestId", async () => {
      await isolated(async (f) => {
        await reachDecision(f);
        harness.actor = f.supervisorId;
        const cmd = {
          ...command(f, "AB-TR-013", 3),
          assignment: rangerAssignment(f),
        };
        const first = await transitionApprovedCase(cmd);
        expect((await transitionApprovedCase(cmd)).replayed).toBe(true);
        await expect(
          transitionApprovedCase({
            ...cmd,
            assignment: {
              ...cmd.assignment,
              instructions: "Different safety-critical instructions",
            },
          }),
        ).rejects.toMatchObject({
          status: 409,
          code: "REQUEST_ID_REUSED_WITH_DIFFERENT_DATA",
        });
        expect(
          await f.tx
            .select()
            .from(domainTasks)
            .where(eq(domainTasks.caseId, f.caseId)),
        ).toHaveLength(1);
        expect(first.taskId).toEqual(expect.any(String));
      });
    });

    it("rejects stale version/state without new audit event", async () => {
      await isolated(async (f) => {
        await send(f, "AB-TR-010", 1);
        await expect(send(f, "AB-TR-011", 1)).rejects.toMatchObject({
          status: 409,
          code: "CASE_STATE_OR_VERSION_CONFLICT",
        });
        expect(
          await f.tx
            .select()
            .from(caseTransitionEvents)
            .where(eq(caseTransitionEvents.caseId, f.caseId)),
        ).toHaveLength(1);
      });
    });

    it("rejects revoked Operator grant even if earlier access check was approved", async () => {
      await isolated(async (f) => {
        await f.tx
          .update(roleGrants)
          .set({ revokedAt: new Date(), revokedById: f.supervisorId })
          .where(
            and(
              eq(roleGrants.userId, f.operatorId),
              eq(roleGrants.organizationId, f.orgA),
            ),
          );
        await expect(send(f, "AB-TR-010", 1)).rejects.toMatchObject({
          status: 403,
          code: "ROLE_OR_SCOPE_DENIED",
        });
        expect(
          await f.tx
            .select()
            .from(caseTransitionEvents)
            .where(eq(caseTransitionEvents.caseId, f.caseId)),
        ).toHaveLength(0);
      });
    });

    it("cross-organization attempt is refused despite mocked preflight", async () => {
      await isolated(async (f) => {
        harness.actor = f.operatorId;
        await expect(
          transitionApprovedCase({
            ...command(f, "AB-TR-010", 1),
            organizationId: f.orgB,
          }),
        ).rejects.toMatchObject({ status: 403, code: "ROLE_OR_SCOPE_DENIED" });
      });
    });

    it("requires active linked observation before review", async () => {
      await isolated(async (f) => {
        await f.tx
          .update(caseObservationLinks)
          .set({
            unlinkedAt: sql`GREATEST(${caseObservationLinks.linkedAt}, clock_timestamp())`,
            unlinkedByUserId: f.operatorId,
          })
          .where(eq(caseObservationLinks.caseId, f.caseId));
        await expect(send(f, "AB-TR-010", 1)).rejects.toMatchObject({
          status: 422,
          code: "CASE_OBSERVATION_REQUIRED",
        });
      });
    });

    it("rejects inactive Ranger and rolls back AB-TR-013", async () => {
      await isolated(async (f) => {
        await reachDecision(f);
        await f.tx
          .update(userAccess)
          .set({ status: "disabled" })
          .where(eq(userAccess.userId, f.rangerId));
        await expect(
          send(f, "AB-TR-013", 3, rangerAssignment(f)),
        ).rejects.toMatchObject({
          status: 422,
          code: "RANGER_NOT_ACTIVE_OR_SCOPED",
        });
        const [caseRow] = await f.tx
          .select()
          .from(domainCases)
          .where(eq(domainCases.id, f.caseId));
        expect(caseRow).toMatchObject({
          status: "awaiting_decision",
          version: 3,
        });
        expect(
          await f.tx
            .select()
            .from(domainTasks)
            .where(eq(domainTasks.caseId, f.caseId)),
        ).toHaveLength(0);
      });
    });

    it("rejects cross-organization Ranger and zone", async () => {
      await isolated(async (f) => {
        await reachDecision(f);
        const assignment = rangerAssignment(f);
        await expect(
          send(f, "AB-TR-013", 3, {
            ...assignment,
            rangerUserId: f.otherRangerId,
          }),
        ).rejects.toMatchObject({
          status: 422,
          code: "RANGER_NOT_ACTIVE_OR_SCOPED",
        });
        await expect(
          send(f, "AB-TR-013", 3, { ...assignment, zoneId: f.zoneB }),
        ).rejects.toMatchObject({
          status: 422,
          code: "VALID_OPERATIONAL_ZONE_REQUIRED",
        });
      });
    });

    it("injected assignment INSERT failure rolls back Case, Task and audit atomically", async () => {
      await isolated(async (f) => {
        await reachDecision(f);
        // DDL is transactional; this test-only trigger never survives outer rollback.
        await f.tx.execute(
          sql`CREATE FUNCTION wc012_inject_assignment_failure() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'WC012_INJECTED_ASSIGNMENT_FAILURE'; END; $$ LANGUAGE plpgsql`,
        );
        await f.tx.execute(
          sql`CREATE TRIGGER wc012_inject_assignment_failure BEFORE INSERT ON task_assignments FOR EACH ROW EXECUTE FUNCTION wc012_inject_assignment_failure()`,
        );
        await expect(
          send(f, "AB-TR-013", 3, rangerAssignment(f)),
        ).rejects.toMatchObject({
          cause: expect.objectContaining({
            code: "P0001",
            message: expect.stringContaining(
              "WC012_INJECTED_ASSIGNMENT_FAILURE",
            ),
          }),
        });
        const [caseRow] = await f.tx
          .select()
          .from(domainCases)
          .where(eq(domainCases.id, f.caseId));
        expect(caseRow).toMatchObject({
          status: "awaiting_decision",
          version: 3,
        });
        expect(
          await f.tx
            .select()
            .from(domainTasks)
            .where(eq(domainTasks.caseId, f.caseId)),
        ).toHaveLength(0);
        expect(
          await f.tx
            .select()
            .from(caseTransitionEvents)
            .where(eq(caseTransitionEvents.caseId, f.caseId)),
        ).toHaveLength(2);
      });
    });
  },
);
