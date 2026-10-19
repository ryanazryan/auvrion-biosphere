/**
 * AB-WC-008 Slice 02: real PostgreSQL service integration tests.
 *
 * Opt-in only; uses the existing WC-007 isolated PostgreSQL/PostGIS database:
 *   127.0.0.1:5435 / auvrion_wc007_test
 *
 * Each test creates synthetic fixtures inside an outer Drizzle transaction.
 * The service's own transaction becomes a PostgreSQL SAVEPOINT. The outer
 * transaction is always rolled back, even when a test assertion fails.
 *
 * This verifies the real observation service + PostgreSQL constraints, NOT
 * signed sessions, operational MFA, or real network HTTP requests.
 */
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { organizations } from "@/server/db/grants-schema";
import {
  environmentalMeasurements,
  observationProvenance,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import {
  type CreateObservationInput,
  parseCreateObservationInput,
} from "./observation-input";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ getDb: mocks.getDb }));

import {
  createManualObservation,
  getScopedObservation,
  listScopedObservations,
} from "./observation-service";

const ENABLED = process.env.RUN_WC008_DB_TESTS === "YES";
type Database = ReturnType<typeof drizzle>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type Fixture = {
  organizationA: string;
  organizationB: string;
  manualA: string;
  manualB: string;
  inactiveA: string;
  deviceA: string;
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
    throw new Error("WC008_REFUSING_UNEXPECTED_DEVELOPMENT_URL");
  }

  const test = new URL(dev.toString());
  test.port = "5435";
  test.pathname = "/auvrion_wc007_test";
  if (
    test.hostname !== "127.0.0.1" ||
    test.port !== "5435" ||
    test.pathname !== "/auvrion_wc007_test"
  ) {
    throw new Error("WC008_REFUSING_NONISOLATED_DATABASE");
  }
  return test.toString();
}

async function seed(tx: Transaction): Promise<Fixture> {
  const fixture: Fixture = {
    organizationA: randomUUID(),
    organizationB: randomUUID(),
    manualA: randomUUID(),
    manualB: randomUUID(),
    inactiveA: randomUUID(),
    deviceA: randomUUID(),
  };

  await tx.insert(organizations).values([
    {
      id: fixture.organizationA,
      code: `WC008-A-${fixture.organizationA}`,
      name: "WC008 Synthetic Organization A",
    },
    {
      id: fixture.organizationB,
      code: `WC008-B-${fixture.organizationB}`,
      name: "WC008 Synthetic Organization B",
    },
  ]);

  await tx.insert(observationSources).values([
    {
      id: fixture.manualA,
      organizationId: fixture.organizationA,
      kind: "manual",
      code: "MANUAL-A",
      label: "Synthetic Manual Source A",
      isActive: true,
    },
    {
      id: fixture.manualB,
      organizationId: fixture.organizationB,
      kind: "manual",
      code: "MANUAL-B",
      label: "Synthetic Manual Source B",
      isActive: true,
    },
    {
      id: fixture.inactiveA,
      organizationId: fixture.organizationA,
      kind: "manual",
      code: "INACTIVE-A",
      label: "Synthetic Inactive Source A",
      isActive: false,
    },
    {
      id: fixture.deviceA,
      organizationId: fixture.organizationA,
      kind: "prevent_device",
      code: "DEVICE-A",
      label: "Synthetic Nonmanual Source A",
      isActive: true,
    },
  ]);
  return fixture;
}

function validInput(
  fixture: Fixture,
  overrides: Record<string, unknown> = {},
): CreateObservationInput {
  const parsed = parseCreateObservationInput({
    organizationId: fixture.organizationA,
    sourceId: fixture.manualA,
    sourceRecordId: `wc008-${randomUUID()}`,
    domain: "biodiversity",
    ingestionMode: "historical",
    observedAt: "2026-10-18T08:00:00+08:00",
    locationUnknownReason: "not-collected",
    provenance: {
      attribution: "WC008 synthetic integration fixture",
      limitations: ["test-only"],
    },
    ...overrides,
  });
  if (!parsed.ok) {
    throw new Error(`WC008_INVALID_TEST_INPUT: ${parsed.error}`);
  }
  return parsed.value;
}

/** Ensure ALL synthetic fixture data is rolled back, including successful inserts. */
async function inRolledBackFixture(
  database: Database,
  check: (tx: Transaction, fixture: Fixture) => Promise<void>,
): Promise<void> {
  const expectedRollback = new Error("WC008_EXPECTED_FIXTURE_ROLLBACK");
  try {
    await database.transaction(async (tx) => {
      mocks.getDb.mockReturnValue(tx);
      const fixture = await seed(tx);
      await check(tx, fixture);
      throw expectedRollback;
    });
    throw new Error("WC008_FIXTURE_TRANSACTION_UNEXPECTEDLY_COMMITTED");
  } catch (error) {
    if (error !== expectedRollback) throw error;
  } finally {
    mocks.getDb.mockReset();
  }
}

describe.skipIf(!ENABLED)(
  "AB-WC-008 observation service PostgreSQL (isolated)",
  () => {
    let pool: Pool | undefined;
    let database: Database;

    beforeAll(async () => {
      pool = new Pool({
        connectionString: isolatedDatabaseUrl(),
        max: 1,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 1000,
      });
      const identity = await pool.query(
        "SELECT current_database() AS name, current_user AS username",
      );
      if (
        identity.rows[0]?.name !== "auvrion_wc007_test" ||
        identity.rows[0]?.username !== "auvrion_dev"
      ) {
        throw new Error("WC008_REFUSING_UNEXPECTED_CONNECTED_DATABASE");
      }
      database = drizzle({ client: pool });
    }, 20000);

    afterAll(async () => {
      mocks.getDb.mockReset();
      await pool?.end();
    });

    it("persists a manual biodiversity observation and exactly one provenance", async () => {
      await inRolledBackFixture(database, async (tx, fixture) => {
        const input = validInput(fixture);
        const created = await createManualObservation(input);
        expect(created.replayed).toBe(false);

        const rows = await tx
          .select()
          .from(observations)
          .where(eq(observations.id, created.id));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          organizationId: fixture.organizationA,
          sourceId: fixture.manualA,
          quality: "unreviewed",
          domain: "biodiversity",
        });
        const provenance = await tx
          .select()
          .from(observationProvenance)
          .where(eq(observationProvenance.observationId, created.id));
        expect(provenance).toHaveLength(1);
        expect(provenance[0]?.acquisitionMethod).toBe("manual_entry");
        expect(provenance[0]?.payloadSha256).toMatch(/^[0-9a-f]{64}$/);
      });
    });

    it("atomically persists environmental measurements and explicit unknown time", async () => {
      await inRolledBackFixture(database, async (tx, fixture) => {
        const input = validInput(fixture, {
          domain: "environmental_risk",
          observedAt: null,
          unknownObservedTimeReason: "not-recorded",
          measurements: [
            {
              kind: "temperature",
              measuredValue: "30.500000",
              unit: "celsius",
            },
            { kind: "pm2_5", measuredValue: "21.250000", unit: "ug/m3" },
          ],
        });
        const created = await createManualObservation(input);
        const rows = await tx
          .select()
          .from(observations)
          .where(eq(observations.id, created.id));
        expect(rows[0]?.observedAt).toBeNull();
        expect(rows[0]?.unknownObservedTimeReason).toBe("not-recorded");
        const measurements = await tx
          .select()
          .from(environmentalMeasurements)
          .where(eq(environmentalMeasurements.observationId, created.id));
        expect(measurements).toHaveLength(2);
        expect(measurements.map((item) => item.kind).sort()).toEqual([
          "pm2_5",
          "temperature",
        ]);
        expect(
          measurements.every((item) => item.quality === "unreviewed"),
        ).toBe(true);
      });
    });

    it("replays an identical source record without duplicating rows", async () => {
      await inRolledBackFixture(database, async (tx, fixture) => {
        const input = validInput(fixture);
        const first = await createManualObservation(input);
        const retry = await createManualObservation(input);
        expect(first.replayed).toBe(false);
        expect(retry).toEqual({ id: first.id, replayed: true });
        const rows = await tx
          .select()
          .from(observations)
          .where(
            and(
              eq(observations.sourceId, input.sourceId),
              eq(observations.sourceRecordId, input.sourceRecordId),
            ),
          );
        expect(rows).toHaveLength(1);
      });
    });

    it("returns a conflict for a changed payload with the same identity", async () => {
      await inRolledBackFixture(database, async (tx, fixture) => {
        const input = validInput(fixture);
        await createManualObservation(input);
        await expect(
          createManualObservation({
            ...input,
            attribution: "changed-attribution",
          }),
        ).rejects.toMatchObject({
          status: 409,
          reason: "SOURCE_RECORD_ID_CONFLICT",
        });
        const rows = await tx
          .select()
          .from(observations)
          .where(
            and(
              eq(observations.sourceId, input.sourceId),
              eq(observations.sourceRecordId, input.sourceRecordId),
            ),
          );
        expect(rows).toHaveLength(1);
      });
    });

    it("rejects another organization's manual source", async () => {
      await inRolledBackFixture(database, async (_tx, fixture) => {
        await expect(
          createManualObservation(
            validInput(fixture, { sourceId: fixture.manualB }),
          ),
        ).rejects.toMatchObject({
          status: 422,
          reason: "ACTIVE_MANUAL_SOURCE_REQUIRED",
        });
      });
    });

    it("rejects inactive manual and active nonmanual sources", async () => {
      await inRolledBackFixture(database, async (_tx, fixture) => {
        for (const sourceId of [fixture.inactiveA, fixture.deviceA]) {
          await expect(
            createManualObservation(validInput(fixture, { sourceId })),
          ).rejects.toMatchObject({
            status: 422,
            reason: "ACTIVE_MANUAL_SOURCE_REQUIRED",
          });
        }
      });
    });

    it("rolls back observation and provenance on a failed measurement insert", async () => {
      await inRolledBackFixture(database, async (tx, fixture) => {
        const original = validInput(fixture);
        // Deliberately bypass HTTP validation to trigger a real PostgreSQL
        // NUMERIC conversion failure after observation + provenance writes.
        const invalid: CreateObservationInput = {
          ...original,
          measurements: [
            {
              kind: "temperature",
              measuredValue: "not-a-number",
              unit: "celsius",
              measuredAt: null,
            },
          ],
        };
        await expect(createManualObservation(invalid)).rejects.toThrow();
        const observationRows = await tx
          .select()
          .from(observations)
          .where(
            and(
              eq(observations.sourceId, original.sourceId),
              eq(observations.sourceRecordId, original.sourceRecordId),
            ),
          );
        expect(observationRows).toHaveLength(0);
      });
    });

    it("scopes list/detail/count/pagination and redacts precise coordinates", async () => {
      await inRolledBackFixture(database, async (_tx, fixture) => {
        const firstInput = validInput(fixture, {
          latitude: -2.5,
          longitude: 114.4,
          locationUnknownReason: null,
        });
        const secondInput = validInput(fixture);
        const foreignInput = validInput(fixture, {
          organizationId: fixture.organizationB,
          sourceId: fixture.manualB,
        });
        const first = await createManualObservation(firstInput);
        const second = await createManualObservation(secondInput);
        const foreign = await createManualObservation(foreignInput);

        const firstPage = await listScopedObservations({
          organizationId: fixture.organizationA,
          limit: 1,
          offset: 0,
        });
        expect(firstPage.total).toBe(2);
        expect(firstPage.items).toHaveLength(1);
        const secondPage = await listScopedObservations({
          organizationId: fixture.organizationA,
          limit: 1,
          offset: 1,
        });
        expect(secondPage.total).toBe(2);
        expect(secondPage.items).toHaveLength(1);
        expect(
          new Set([...firstPage.items, ...secondPage.items].map((x) => x.id)),
        ).toEqual(new Set([first.id, second.id]));

        const foreignPage = await listScopedObservations({
          organizationId: fixture.organizationB,
          limit: 25,
          offset: 0,
        });
        expect(foreignPage.total).toBe(1);
        expect(foreignPage.items.map((item) => item.id)).toEqual([foreign.id]);
        expect(
          await getScopedObservation(fixture.organizationA, foreign.id),
        ).toBeNull();

        const detail = await getScopedObservation(
          fixture.organizationA,
          first.id,
        );
        expect(detail).not.toBeNull();
        expect(detail?.location.hasCoordinates).toBe(true);
        const serialized = JSON.stringify(detail);
        expect(serialized).not.toContain('"latitude"');
        expect(serialized).not.toContain('"longitude"');
        expect(serialized).not.toContain("114.4");
      });
    });
  },
);
