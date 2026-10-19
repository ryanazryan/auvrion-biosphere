/**
 * AB-WC-007 Slice04: real Postgres report data integrity tests.
 * Opt in with RUN_WC007_DB_TESTS=YES; requires migrated isolated 127.0.0.1:5435.
 * Not an API, report-calculation, authorization, or legal-policy validation.
 * Fixtures are transaction-scoped and rolled back, including positive writes.
 */
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ENABLED = process.env.RUN_WC007_DB_TESTS === "YES";
const f = {
  organizationA: randomUUID(),
  organizationB: randomUUID(),
  actor: `wc007-report-${randomUUID()}`,
  sourceA: randomUUID(),
  sourceB: randomUUID(),
  observationA: randomUUID(),
  observationB: randomUUID(),
  caseA: randomUUID(),
  caseB: randomUUID(),
  taskA: randomUUID(),
  report1: randomUUID(),
  report2: randomUUID(),
};
const sameScopeHash = "a".repeat(64);

function isolatedTestUrl(): string {
  loadEnvFile(".env.local");
  const dev = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (
    !["postgres:", "postgresql:"].includes(dev.protocol) ||
    dev.hostname !== "127.0.0.1" ||
    dev.port !== "5433" ||
    dev.pathname !== "/auvrion_dev" ||
    decodeURIComponent(dev.username) !== "auvrion_dev"
  ) {
    throw new Error("WC007_REPORT_REFUSED_UNEXPECTED_DEV_DATABASE");
  }
  dev.port = "5435";
  dev.pathname = "/auvrion_wc007_test";
  return dev.toString();
}

describe.skipIf(!ENABLED)(
  "WC-007 report provenance integrity (isolated)",
  () => {
    let pool: Pool | undefined;
    let client: PoolClient | undefined;

    function db(): PoolClient {
      if (!client) throw new Error("WC007_REPORT_NO_DB_CLIENT");
      return client;
    }

    async function rejected(
      sql: string,
      params: unknown[],
      expectedCode: string,
    ) {
      await db().query("SAVEPOINT wc007_report_negative");
      try {
        await expect(db().query(sql, params)).rejects.toMatchObject({
          code: expectedCode,
        });
      } finally {
        await db().query("ROLLBACK TO SAVEPOINT wc007_report_negative");
        await db().query("RELEASE SAVEPOINT wc007_report_negative");
      }
    }

    beforeAll(async () => {
      pool = new Pool({
        connectionString: isolatedTestUrl(),
        max: 1,
        connectionTimeoutMillis: 5000,
      });
      client = await pool.connect();
      await db().query("BEGIN");
      const { rows } = await db().query(
        "SELECT current_database() AS name, current_user AS db_user",
      );
      if (
        rows[0]?.name !== "auvrion_wc007_test" ||
        rows[0]?.db_user !== "auvrion_dev"
      ) {
        throw new Error("WC007_REPORT_REFUSED_UNKNOWN_DATABASE");
      }
      await db().query(
        'INSERT INTO "organizations" ("id","code","name") VALUES ($1,$2,$3),($4,$5,$6)',
        [
          f.organizationA,
          `WC007-${f.organizationA}`,
          "Report Org A",
          f.organizationB,
          `WC007-${f.organizationB}`,
          "Report Org B",
        ],
      );
      await db().query(
        'INSERT INTO "user" ("id","name","email") VALUES ($1,$2,$3)',
        [f.actor, "Report Fixture Actor", `${f.actor}@example.invalid`],
      );
      await db().query(
        "INSERT INTO \"observation_sources\" (\"id\",\"organization_id\",\"kind\",\"code\",\"label\") VALUES ($1,$2,'manual','REPORT-A','Manual A'),($3,$4,'manual','REPORT-B','Manual B')",
        [f.sourceA, f.organizationA, f.sourceB, f.organizationB],
      );
      await db().query(
        'INSERT INTO "observations" ("id","organization_id","source_id","domain","ingestion_mode","observed_at","location_unknown_reason") VALUES ($1,$2,$3,\'environmental_risk\',\'historical\',now(),\'not available\'),($4,$5,$6,\'environmental_risk\',\'historical\',now(),\'not available\')',
        [
          f.observationA,
          f.organizationA,
          f.sourceA,
          f.observationB,
          f.organizationB,
          f.sourceB,
        ],
      );
      await db().query(
        'INSERT INTO "domain_cases" ("id","organization_id","title","opened_by_user_id") VALUES ($1,$2,\'Report case A\',$3),($4,$5,\'Report case B\',$3)',
        [f.caseA, f.organizationA, f.actor, f.caseB, f.organizationB],
      );
      await db().query(
        'INSERT INTO "domain_tasks" ("id","organization_id","case_id","title","created_by_user_id") VALUES ($1,$2,$3,\'Report task A\',$4)',
        [f.taskA, f.organizationA, f.caseA, f.actor],
      );
      for (const [report, revision] of [
        [f.report1, 1],
        [f.report2, 2],
      ] as const) {
        await db().query(
          'INSERT INTO "report_versions" ("id","organization_id","local_day","scope_hash","scope_snapshot","revision","generated_by_user_id") VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)',
          [
            report,
            f.organizationA,
            "2026-10-19",
            sameScopeHash,
            JSON.stringify({ zone: "all", day: "2026-10-19" }),
            revision,
            f.actor,
          ],
        );
      }
      await db().query(
        'INSERT INTO "report_inputs" ("organization_id","report_version_id","observation_id","input_version","input_snapshot") VALUES ($1,$2,$3,1,$4::jsonb)',
        [
          f.organizationA,
          f.report1,
          f.observationA,
          JSON.stringify({ quality: "unreviewed", origin: "manual" }),
        ],
      );
    }, 20000);

    afterAll(async () => {
      try {
        await client?.query("ROLLBACK");
      } finally {
        client?.release();
        await pool?.end();
      }
    }, 15000);

    it("records two revisions per day and distinguishes no-count from zero", async () => {
      const { rows } = await db().query(
        'SELECT revision, timezone, counts FROM "report_versions" WHERE organization_id=$1 ORDER BY revision',
        [f.organizationA],
      );
      expect(rows).toEqual([
        { revision: 1, timezone: "Asia/Makassar", counts: null },
        { revision: 2, timezone: "Asia/Makassar", counts: null },
      ]);
    });

    it("allows same-organization input records with versioned snapshots", async () => {
      const inserted = await db().query(
        'INSERT INTO "report_inputs" ("organization_id","report_version_id","case_id","input_version","input_snapshot") VALUES ($1,$2,$3,1,$4::jsonb) RETURNING id',
        [
          f.organizationA,
          f.report1,
          f.caseA,
          JSON.stringify({ review: "pending" }),
        ],
      );
      const another = await db().query(
        'INSERT INTO "report_inputs" ("organization_id","report_version_id","task_id","input_version","input_snapshot") VALUES ($1,$2,$3,1,$4::jsonb) RETURNING id',
        [
          f.organizationA,
          f.report1,
          f.taskA,
          JSON.stringify({ state: "unknown" }),
        ],
      );
      expect(inserted.rowCount).toBe(1);
      expect(another.rowCount).toBe(1);
    });

    it("rejects cross-organization observation input", async () => {
      await rejected(
        'INSERT INTO "report_inputs" ("organization_id","report_version_id","observation_id","input_version","input_snapshot") VALUES ($1,$2,$3,1,\'{}\'::jsonb)',
        [f.organizationA, f.report1, f.observationB],
        "23503",
      );
    });

    it("rejects cross-organization report membership", async () => {
      await rejected(
        'INSERT INTO "report_inputs" ("organization_id","report_version_id","observation_id","input_version","input_snapshot") VALUES ($1,$2,$3,2,\'{}\'::jsonb)',
        [f.organizationB, f.report1, f.observationB],
        "23503",
      );
    });

    it("rejects input without exactly one target or non-object snapshot", async () => {
      await rejected(
        'INSERT INTO "report_inputs" ("organization_id","report_version_id","input_version","input_snapshot") VALUES ($1,$2,1,\'{}\'::jsonb)',
        [f.organizationA, f.report1],
        "23514",
      );
      await rejected(
        'INSERT INTO "report_inputs" ("organization_id","report_version_id","observation_id","case_id","input_version","input_snapshot") VALUES ($1,$2,$3,$4,1,\'{}\'::jsonb)',
        [f.organizationA, f.report1, f.observationA, f.caseA],
        "23514",
      );
      await rejected(
        'INSERT INTO "report_inputs" ("organization_id","report_version_id","case_id","input_version","input_snapshot") VALUES ($1,$2,$3,1,\'[]\'::jsonb)',
        [f.organizationA, f.report1, f.caseA],
        "23514",
      );
    });

    it("rejects duplicate input/version and invalid revision", async () => {
      await rejected(
        'INSERT INTO "report_inputs" ("organization_id","report_version_id","observation_id","input_version","input_snapshot") VALUES ($1,$2,$3,1,\'{}\'::jsonb)',
        [f.organizationA, f.report1, f.observationA],
        "23505",
      );
      await rejected(
        'INSERT INTO "report_versions" ("organization_id","local_day","scope_hash","scope_snapshot","revision") VALUES ($1,$2,$3,\'{}\'::jsonb,0)',
        [f.organizationA, "2026-10-19", "b".repeat(64)],
        "23514",
      );
    });

    it("enforces only one currently published report per organization/day/scope", async () => {
      await db().query("SAVEPOINT wc007_report_publish");
      try {
        await db().query(
          'UPDATE "report_versions" SET "published_at"=now() WHERE id=$1',
          [f.report1],
        );
        await rejected(
          'UPDATE "report_versions" SET "published_at"=now() WHERE id=$1',
          [f.report2],
          "23505",
        );
        await db().query(
          'UPDATE "report_versions" SET "superseded_at"=now() WHERE id=$1',
          [f.report1],
        );
        await db().query(
          'UPDATE "report_versions" SET "published_at"=now() WHERE id=$1',
          [f.report2],
        );
        const { rows } = await db().query(
          'SELECT revision FROM "report_versions" WHERE organization_id=$1 AND published_at IS NOT NULL AND superseded_at IS NULL',
          [f.organizationA],
        );
        expect(rows).toEqual([{ revision: 2 }]);
      } finally {
        await db().query("ROLLBACK TO SAVEPOINT wc007_report_publish");
        await db().query("RELEASE SAVEPOINT wc007_report_publish");
      }
    });
  },
);
