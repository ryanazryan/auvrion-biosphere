/**
 * AB-WC-013 Slice 01: actual DB-backed read-scope acceptance.
 * Opt-in only with RUN_WC007_DB_TESTS=YES.
 * Targets ONLY 127.0.0.1:5435/auvrion_wc007_test.
 * Each case uses a PostgreSQL transaction deliberately rolled back afterward.
 * The HTTP/signed-session/MFA boundary is tested separately in route/auth tests.
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
import { domainCases } from "@/server/db/observation-domain-schema";
import {
  domainTasks,
  taskAssignments,
} from "@/server/db/operations-domain-schema";

const harness = vi.hoisted(() => ({ tx: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ getDb: () => harness.tx }));

import { getMyRangerTask, listMyRangerTasks } from "./ranger-task-service";

type Db = ReturnType<typeof drizzle>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Fixture = {
  tx: Tx;
  orgA: string;
  orgB: string;
  rangerA: string;
  rangerB: string;
  supervisor: string;
  taskA: string;
  taskB: string;
  taskOtherOrg: string;
  assignmentA: string;
};

function isolatedDatabaseUrl() {
  loadEnvFile(".env.local");
  const source = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (
    !["postgres:", "postgresql:"].includes(source.protocol) ||
    source.hostname !== "127.0.0.1" ||
    source.port !== "5433" ||
    source.pathname !== "/auvrion_dev" ||
    decodeURIComponent(source.username) !== "auvrion_dev"
  ) {
    throw new Error("WC013_REFUSED_UNKNOWN_DEV_DATABASE_URL");
  }
  source.port = "5435";
  source.pathname = "/auvrion_wc007_test";
  if (
    source.hostname !== "127.0.0.1" ||
    source.port !== "5435" ||
    source.pathname !== "/auvrion_wc007_test"
  ) {
    throw new Error("WC013_REFUSED_NONISOLATED_DATABASE");
  }
  return source.toString();
}

const ENABLED = process.env.RUN_WC007_DB_TESTS === "YES";

describe.skipIf(!ENABLED)(
  "AB-WC-013 Ranger read scope — isolated PostgreSQL",
  () => {
    let pool: Pool;
    let db: Db;

    beforeAll(async () => {
      pool = new Pool({
        connectionString: isolatedDatabaseUrl(),
        max: 2,
        connectionTimeoutMillis: 5000,
      });
      db = drizzle({ client: pool });
      const { rows } = await pool.query(
        "SELECT current_database() AS db, EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis') AS postgis, to_regclass('public.task_assignments') IS NOT NULL AS has_assignments",
      );
      if (
        rows[0]?.db !== "auvrion_wc007_test" ||
        rows[0]?.postgis !== true ||
        rows[0]?.has_assignments !== true
      ) {
        throw new Error("WC013_REFUSED_UNMIGRATED_OR_UNSAFE_DB");
      }
    }, 20000);

    afterAll(async () => {
      await pool?.end();
    }, 20000);

    async function seed(tx: Tx): Promise<Fixture> {
      const orgA = randomUUID();
      const orgB = randomUUID();
      const supervisor = `wc013-supervisor-${randomUUID()}`;
      const rangerA = `wc013-ranger-a-${randomUUID()}`;
      const rangerB = `wc013-ranger-b-${randomUUID()}`;
      const taskA = randomUUID();
      const taskB = randomUUID();
      const taskOtherOrg = randomUUID();
      const caseA = randomUUID();
      const caseB = randomUUID();
      const assignmentA = randomUUID();
      const people = [supervisor, rangerA, rangerB];

      await tx.insert(organizations).values([
        { id: orgA, code: `WC013-${orgA}`, name: "WC013 Isolated A" },
        { id: orgB, code: `WC013-${orgB}`, name: "WC013 Isolated B" },
      ]);
      await tx.insert(user).values(
        people.map((id) => ({
          id,
          name: id,
          email: `${id}@example.invalid`,
          emailVerified: true,
        })),
      );
      const apps = people.map((id) => ({
        id: randomUUID(),
        applicantName: id,
        email: `${id}@example.invalid`,
        status: "approved" as const,
        emailVerifiedAt: new Date(),
        reviewedAt: new Date(),
        reviewedById: supervisor,
      }));
      await tx.insert(accessApplications).values(apps);
      await tx.insert(userAccess).values(
        people.map((id, i) => ({
          userId: id,
          applicationId: apps[i]?.id ?? "MISSING_APPLICATION",
          status: "active" as const,
        })),
      );
      await tx.insert(roleGrants).values([
        {
          userId: rangerA,
          organizationId: orgA,
          role: "ranger",
          grantedById: supervisor,
        },
        {
          userId: rangerB,
          organizationId: orgA,
          role: "ranger",
          grantedById: supervisor,
        },
        {
          userId: rangerB,
          organizationId: orgB,
          role: "ranger",
          grantedById: supervisor,
        },
      ]);
      await tx.insert(domainCases).values([
        {
          id: caseA,
          organizationId: orgA,
          title: "Test case organization A",
          openedByUserId: supervisor,
        },
        {
          id: caseB,
          organizationId: orgB,
          title: "Test case organization B",
          openedByUserId: supervisor,
        },
      ]);
      await tx.insert(domainTasks).values([
        {
          id: taskA,
          organizationId: orgA,
          caseId: caseA,
          title: "Ranger A field task",
          instructions: "Review the observation, no exact location",
          safetyNotes: "Stop if field conditions become unsafe",
          createdByUserId: supervisor,
        },
        {
          id: taskB,
          organizationId: orgA,
          caseId: caseA,
          title: "Ranger B field task",
          createdByUserId: supervisor,
        },
        {
          id: taskOtherOrg,
          organizationId: orgB,
          caseId: caseB,
          title: "Organization B task",
          createdByUserId: supervisor,
        },
      ]);
      await tx.insert(taskAssignments).values([
        {
          id: assignmentA,
          organizationId: orgA,
          taskId: taskA,
          rangerUserId: rangerA,
          assignedByUserId: supervisor,
          reason: "WC013 test assignment A",
        },
        {
          organizationId: orgA,
          taskId: taskB,
          rangerUserId: rangerB,
          assignedByUserId: supervisor,
          reason: "WC013 test assignment B",
        },
        {
          organizationId: orgB,
          taskId: taskOtherOrg,
          rangerUserId: rangerB,
          assignedByUserId: supervisor,
          reason: "WC013 test assignment different organization",
        },
      ]);
      return {
        tx,
        orgA,
        orgB,
        rangerA,
        rangerB,
        supervisor,
        taskA,
        taskB,
        taskOtherOrg,
        assignmentA,
      };
    }

    async function isolated(run: (fixture: Fixture) => Promise<void>) {
      const rollbackMarker = new Error("WC013_EXPECTED_ROLLBACK");
      let testError: unknown;
      try {
        await db.transaction(async (tx) => {
          harness.tx = tx;
          try {
            await run(await seed(tx));
          } catch (error) {
            testError = error;
          }
          throw rollbackMarker;
        });
      } catch (error) {
        if (error !== rollbackMarker) throw error;
      } finally {
        harness.tx = null;
      }
      if (testError) throw testError;
    }

    it("returns only effective assigned tasks for authenticated Ranger identity", async () => {
      await isolated(async (f) => {
        const a = await listMyRangerTasks(f.orgA, f.rangerA, 25);
        expect(a.items.map((t) => t.id)).toEqual([f.taskA]);
        expect(a.limit).toBe(25);
        const b = await listMyRangerTasks(f.orgA, f.rangerB, 25);
        expect(b.items.map((t) => t.id)).toEqual([f.taskB]);
      });
    });

    it("prevents guessed IDs, other Ranger assignment and organization leakage", async () => {
      await isolated(async (f) => {
        expect(await getMyRangerTask(f.orgA, f.rangerB, f.taskA)).toBeNull();
        expect(await getMyRangerTask(f.orgA, f.rangerA, f.taskB)).toBeNull();
        expect(
          await getMyRangerTask(f.orgA, f.rangerA, f.taskOtherOrg),
        ).toBeNull();
        expect(await getMyRangerTask(f.orgB, f.rangerA, f.taskA)).toBeNull();
        expect(
          await getMyRangerTask(f.orgA, f.rangerA, randomUUID()),
        ).toBeNull();
      });
    });

    it("rechecks revoked Ranger grant for both list and detail", async () => {
      await isolated(async (f) => {
        await f.tx
          .update(roleGrants)
          .set({ revokedAt: new Date(), revokedById: f.supervisor })
          .where(eq(roleGrants.userId, f.rangerA));
        expect((await listMyRangerTasks(f.orgA, f.rangerA, 25)).items).toEqual(
          [],
        );
        expect(await getMyRangerTask(f.orgA, f.rangerA, f.taskA)).toBeNull();
      });
    });

    it("rechecks disabled user access even with existing assignment", async () => {
      await isolated(async (f) => {
        await f.tx
          .update(userAccess)
          .set({ status: "disabled", disabledAt: new Date() })
          .where(eq(userAccess.userId, f.rangerA));
        expect((await listMyRangerTasks(f.orgA, f.rangerA, 25)).items).toEqual(
          [],
        );
        expect(await getMyRangerTask(f.orgA, f.rangerA, f.taskA)).toBeNull();
      });
    });

    it("removes task visibility immediately after assignment revocation", async () => {
      await isolated(async (f) => {
        const before = await getMyRangerTask(f.orgA, f.rangerA, f.taskA);
        expect(before?.id).toBe(f.taskA);
        await f.tx
          .update(taskAssignments)
          .set({
            unassignedAt: sql`GREATEST(clock_timestamp(), ${taskAssignments.assignedAt})`,
            unassignedByUserId: f.supervisor,
          })
          .where(eq(taskAssignments.id, f.assignmentA));
        expect((await listMyRangerTasks(f.orgA, f.rangerA, 25)).items).toEqual(
          [],
        );
        expect(await getMyRangerTask(f.orgA, f.rangerA, f.taskA)).toBeNull();
      });
    });

    it("allows new assignee after recorded reassignment and hides the old assignee", async () => {
      await isolated(async (f) => {
        await f.tx
          .update(taskAssignments)
          .set({
            unassignedAt: sql`GREATEST(clock_timestamp(), ${taskAssignments.assignedAt})`,
            unassignedByUserId: f.supervisor,
          })
          .where(eq(taskAssignments.id, f.assignmentA));
        await f.tx.insert(taskAssignments).values({
          organizationId: f.orgA,
          taskId: f.taskA,
          rangerUserId: f.rangerB,
          assignedByUserId: f.supervisor,
          reason: "WC013 authorized test reassignment",
          assignedAt: sql`clock_timestamp()`,
        });
        expect(await getMyRangerTask(f.orgA, f.rangerA, f.taskA)).toBeNull();
        expect((await getMyRangerTask(f.orgA, f.rangerB, f.taskA))?.id).toBe(
          f.taskA,
        );
      });
    });

    it("honors safe pagination limit without leaking other Ranger tasks", async () => {
      await isolated(async (f) => {
        expect(
          (await listMyRangerTasks(f.orgA, f.rangerA, 1)).items,
        ).toHaveLength(1);
        expect(
          (await listMyRangerTasks(f.orgA, f.rangerA, 50)).items,
        ).toHaveLength(1);
      });
    });

    it("preserves completed Tasks for authorized Ranger history", async () => {
      await isolated(async (f) => {
        await f.tx
          .update(domainTasks)
          .set({ status: "completed" })
          .where(eq(domainTasks.id, f.taskA));
        const completed = await listMyRangerTasks(f.orgA, f.rangerA, 25);
        expect(completed.items).toEqual([
          expect.objectContaining({
            id: f.taskA,
            status: "completed",
          }),
        ]);
        expect(await getMyRangerTask(f.orgA, f.rangerA, f.taskA)).toMatchObject(
          {
            id: f.taskA,
            status: "completed",
          },
        );
      });
    });

    it("isolates Ranger grant revocation to its organization", async () => {
      await isolated(async (f) => {
        expect((await getMyRangerTask(f.orgA, f.rangerB, f.taskB))?.id).toBe(
          f.taskB,
        );

        expect(
          (await getMyRangerTask(f.orgB, f.rangerB, f.taskOtherOrg))?.id,
        ).toBe(f.taskOtherOrg);

        await f.tx
          .update(roleGrants)
          .set({
            revokedAt: new Date(),
            revokedById: f.supervisor,
          })
          .where(
            and(
              eq(roleGrants.userId, f.rangerB),
              eq(roleGrants.organizationId, f.orgB),
            ),
          );

        expect(
          await getMyRangerTask(f.orgB, f.rangerB, f.taskOtherOrg),
        ).toBeNull();

        expect((await listMyRangerTasks(f.orgB, f.rangerB, 25)).items).toEqual(
          [],
        );

        expect((await getMyRangerTask(f.orgA, f.rangerB, f.taskB))?.id).toBe(
          f.taskB,
        );
      });
    });

    it("preserves cancelled Tasks for authorized Ranger history", async () => {
      await isolated(async (f) => {
        expect((await getMyRangerTask(f.orgA, f.rangerA, f.taskA))?.id).toBe(
          f.taskA,
        );

        await f.tx
          .update(domainTasks)
          .set({ status: "cancelled" })
          .where(eq(domainTasks.id, f.taskA));

        const cancelled = await listMyRangerTasks(f.orgA, f.rangerA, 25);

        expect(cancelled.items).toEqual([
          expect.objectContaining({
            id: f.taskA,
            status: "cancelled",
          }),
        ]);

        expect(await getMyRangerTask(f.orgA, f.rangerA, f.taskA)).toMatchObject(
          {
            id: f.taskA,
            status: "cancelled",
          },
        );
      });
    });

    it("returns task/safety metadata, never private evidence or observation coordinates", async () => {
      await isolated(async (f) => {
        const task = await getMyRangerTask(f.orgA, f.rangerA, f.taskA);
        expect(task).toMatchObject({
          id: f.taskA,
          instructions: "Review the observation, no exact location",
          safetyNotes: "Stop if field conditions become unsafe",
        });
        expect(task).not.toBeNull();
        const keys = Object.keys(task ?? {});
        for (const disallowed of [
          "latitude",
          "longitude",
          "coordinates",
          "location",
          "storageKey",
          "privateMedia",
          "otherRangerUserId",
        ]) {
          expect(keys).not.toContain(disallowed);
        }
      });
    });
  },
);
