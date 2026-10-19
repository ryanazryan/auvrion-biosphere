/**
 * AB-WC-007 database integrity tests: opt-in, independent Postgres/PostGIS
 * container at 127.0.0.1:5435. Never points to development or WC-004 DB.
 * Real constraints are exercised with pg; all fixture writes ROLLBACK.
 * NOT an authentication/authorization, HTTP API or PostGIS-geometry test.
 */
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ENABLED = process.env.RUN_WC007_DB_TESTS === "YES";
const fixture = {
  organizationA: randomUUID(),
  organizationB: randomUUID(),
  sourceA: randomUUID(),
  sourceB: randomUUID(),
  observationA: randomUUID(),
  observationB: randomUUID(),
  caseA: randomUUID(),
  caseA2: randomUUID(),
  caseB: randomUUID(),
  userId: `wc007-${randomUUID()}`,
};

function isolatedTestUrl() {
  loadEnvFile(".env.local");
  const local = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (
    !["postgres:", "postgresql:"].includes(local.protocol) ||
    local.hostname !== "127.0.0.1" ||
    local.port !== "5433" ||
    local.pathname !== "/auvrion_dev" ||
    decodeURIComponent(local.username) !== "auvrion_dev"
  ) {
    throw new Error("WC007_REFUSING_UNKNOWN_DEVELOPMENT_DATABASE");
  }
  local.port = "5435";
  local.pathname = "/auvrion_wc007_test";
  if (
    local.hostname !== "127.0.0.1" ||
    local.port !== "5435" ||
    local.pathname !== "/auvrion_wc007_test"
  ) {
    throw new Error("WC007_REFUSING_NON_ISOLATED_TEST_DATABASE");
  }
  return local.toString();
}

describe.skipIf(!ENABLED)(
  "WC-007 PostgreSQL domain integrity (isolated)",
  () => {
    let pool: Pool | undefined;
    let client: PoolClient | undefined;

    function connection(): PoolClient {
      if (!client) throw new Error("WC007_MISSING_ISOLATED_CLIENT");
      return client;
    }

    /** Failed statements poison PG transactions. Savepoint restores the fixture transaction. */
    async function expectRejected(
      statement: string,
      params: unknown[],
      expectedPgCode: string,
    ) {
      const db = connection();
      await db.query("SAVEPOINT wc007_expected_error");
      try {
        await expect(db.query(statement, params)).rejects.toMatchObject({
          code: expectedPgCode,
        });
      } finally {
        await db.query("ROLLBACK TO SAVEPOINT wc007_expected_error");
        await db.query("RELEASE SAVEPOINT wc007_expected_error");
      }
    }

    beforeAll(async () => {
      pool = new Pool({
        connectionString: isolatedTestUrl(),
        max: 1,
        connectionTimeoutMillis: 5000,
      });
      client = await pool.connect();
      const db = connection();
      await db.query("BEGIN");
      const { rows } = await db.query("SELECT current_database() AS db");
      if (rows[0]?.db !== "auvrion_wc007_test") {
        throw new Error("WC007_REFUSING_UNEXPECTED_CURRENT_DATABASE");
      }

      await db.query(
        'INSERT INTO "organizations" ("id", "code", "name") VALUES ($1,$2,$3),($4,$5,$6)',
        [
          fixture.organizationA,
          `WC007-${fixture.organizationA}`,
          "WC007 Test Organization A",
          fixture.organizationB,
          `WC007-${fixture.organizationB}`,
          "WC007 Test Organization B",
        ],
      );
      await db.query(
        'INSERT INTO "user" ("id", "name", "email") VALUES ($1,$2,$3)',
        [
          fixture.userId,
          "WC007 Synthetic Actor",
          `${fixture.userId}@example.invalid`,
        ],
      );
      await db.query(
        "INSERT INTO \"observation_sources\" (\"id\", \"organization_id\", \"kind\", \"code\", \"label\") VALUES ($1,$2,'prevent_device','PREVENT-01','Sensor A'),($3,$4,'manual','REPORT-B','Manual B')",
        [
          fixture.sourceA,
          fixture.organizationA,
          fixture.sourceB,
          fixture.organizationB,
        ],
      );
      await db.query(
        'INSERT INTO "domain_cases" ("id", "organization_id", "title", "opened_by_user_id") VALUES ($1,$2,\'Potential PM spike\',$6),($3,$2,\'Other local case\',$6),($4,$5,\'Other org case\',$6)',
        [
          fixture.caseA,
          fixture.organizationA,
          fixture.caseA2,
          fixture.caseB,
          fixture.organizationB,
          fixture.userId,
        ],
      );
      await db.query(
        'INSERT INTO "observations" ("id", "organization_id", "source_id", "domain", "ingestion_mode", "source_record_id", "observed_at", "location_unknown_reason") VALUES ($1,$2,$3,\'environmental_risk\',\'live\',\'sample-A\',now(),\'no-geolocation\'),($4,$5,$6,\'environmental_risk\',\'historical\',\'sample-B\',now(),\'no-geolocation\')',
        [
          fixture.observationA,
          fixture.organizationA,
          fixture.sourceA,
          fixture.observationB,
          fixture.organizationB,
          fixture.sourceB,
        ],
      );
      await db.query(
        'INSERT INTO "observation_provenance" ("observation_id", "acquisition_method") VALUES ($1,\'device-sample\')',
        [fixture.observationA],
      );
    }, 20000);

    afterAll(async () => {
      try {
        await client?.query("ROLLBACK");
      } finally {
        client?.release();
        await pool?.end();
      }
    }, 20000);

    it("can store a real observation with provenance and environmental reading", async () => {
      const db = connection();
      const read = await db.query(
        'SELECT o."source_id", p."acquisition_method" FROM "observations" o JOIN "observation_provenance" p ON p."observation_id" = o."id" WHERE o."id" = $1',
        [fixture.observationA],
      );
      expect(read.rows).toHaveLength(1);
      expect(read.rows[0]?.source_id).toBe(fixture.sourceA);
      await db.query(
        'INSERT INTO "environmental_measurements" ("observation_id", "kind", "measured_value", "unit") VALUES ($1,\'pm2_5\',21.5,\'ug/m3\')',
        [fixture.observationA],
      );
    });

    it("rejects observation connected to a source from another organization", async () => {
      await expectRejected(
        'INSERT INTO "observations" ("organization_id", "source_id", "domain", "ingestion_mode", "observed_at", "location_unknown_reason") VALUES ($1,$2,\'environmental_risk\',\'live\',now(),\'unknown\')',
        [fixture.organizationA, fixture.sourceB],
        "23503",
      );
    });

    it("rejects linking a case across organizational boundaries", async () => {
      await expectRejected(
        'INSERT INTO "case_observation_links" ("organization_id", "case_id", "observation_id", "linked_by_user_id", "link_reason") VALUES ($1,$2,$3,$4,\'cross-org should fail\')',
        [
          fixture.organizationA,
          fixture.caseB,
          fixture.observationA,
          fixture.userId,
        ],
        "23503",
      );
    });

    it("rejects repeated source record identities within one source", async () => {
      await expectRejected(
        'INSERT INTO "observations" ("organization_id", "source_id", "domain", "ingestion_mode", "source_record_id", "observed_at", "location_unknown_reason") VALUES ($1,$2,\'environmental_risk\',\'live\',\'sample-A\',now(),\'unknown\')',
        [fixture.organizationA, fixture.sourceA],
        "23505",
      );
    });

    it("rejects duplicate provenance per observation", async () => {
      await expectRejected(
        'INSERT INTO "observation_provenance" ("observation_id", "acquisition_method") VALUES ($1,\'duplicate\')',
        [fixture.observationA],
        "23505",
      );
    });

    it("rejects missing observation timestamp without an unknown reason", async () => {
      await expectRejected(
        'INSERT INTO "observations" ("organization_id", "source_id", "domain", "ingestion_mode", "location_unknown_reason") VALUES ($1,$2,\'environmental_risk\',\'live\',\'not-provided\')',
        [fixture.organizationA, fixture.sourceA],
        "23514",
      );
    });

    it("rejects missing location without an unknown reason", async () => {
      await expectRejected(
        'INSERT INTO "observations" ("organization_id", "source_id", "domain", "ingestion_mode", "observed_at") VALUES ($1,$2,\'environmental_risk\',\'live\',now())',
        [fixture.organizationA, fixture.sourceA],
        "23514",
      );
    });

    it("rejects out-of-range coordinates and incomplete latitude/longitude pairs", async () => {
      await expectRejected(
        'INSERT INTO "observations" ("organization_id", "source_id", "domain", "ingestion_mode", "observed_at", "latitude", "longitude") VALUES ($1,$2,\'environmental_risk\',\'live\',now(),-99,115)',
        [fixture.organizationA, fixture.sourceA],
        "23514",
      );
      await expectRejected(
        'INSERT INTO "observations" ("organization_id", "source_id", "domain", "ingestion_mode", "observed_at", "latitude", "location_unknown_reason") VALUES ($1,$2,\'environmental_risk\',\'live\',now(),-3,\'unknown\')',
        [fixture.organizationA, fixture.sourceA],
        "23514",
      );
    });

    it("rejects blank measurement units", async () => {
      await expectRejected(
        'INSERT INTO "environmental_measurements" ("observation_id", "kind", "measured_value", "unit") VALUES ($1,\'pm2_5\',8,\'   \')',
        [fixture.observationA],
        "23514",
      );
    });

    it("enforces one active case membership and preserves unlink history", async () => {
      const db = connection();
      const first = randomUUID();
      await db.query(
        'INSERT INTO "case_observation_links" ("id", "organization_id", "case_id", "observation_id", "linked_by_user_id", "link_reason") VALUES ($1,$2,$3,$4,$5,\'triage\')',
        [
          first,
          fixture.organizationA,
          fixture.caseA,
          fixture.observationA,
          fixture.userId,
        ],
      );
      await expectRejected(
        'INSERT INTO "case_observation_links" ("organization_id", "case_id", "observation_id", "linked_by_user_id", "link_reason") VALUES ($1,$2,$3,$4,\'double-link\')',
        [
          fixture.organizationA,
          fixture.caseA2,
          fixture.observationA,
          fixture.userId,
        ],
        "23505",
      );
      await expectRejected(
        'UPDATE "case_observation_links" SET "unlinked_at" = now() WHERE "id" = $1',
        [first],
        "23514",
      );
      await db.query(
        'UPDATE "case_observation_links" SET "unlinked_at" = now(), "unlinked_by_user_id" = $2 WHERE "id" = $1',
        [first, fixture.userId],
      );
      await db.query(
        'INSERT INTO "case_observation_links" ("organization_id", "case_id", "observation_id", "linked_by_user_id", "link_reason") VALUES ($1,$2,$3,$4,\'follow up\')',
        [
          fixture.organizationA,
          fixture.caseA2,
          fixture.observationA,
          fixture.userId,
        ],
      );
      const history = await db.query(
        'SELECT count(*)::int AS n FROM "case_observation_links" WHERE "observation_id" = $1',
        [fixture.observationA],
      );
      expect(history.rows[0]?.n).toBe(2);
    });
  },
);
