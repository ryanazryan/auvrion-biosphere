/**
 * WC-007 Slice 03: database-only integrity/spatial checks, not HTTP authorization.
 * Opt in with RUN_WC007_DB_TESTS=YES; connects ONLY to 127.0.0.1:5435.
 * All fixtures are rolled back. Needs migrations 0000–0012 already applied.
 */
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ENABLED = process.env.RUN_WC007_DB_TESTS === "YES";

const f = {
  orgA: randomUUID(),
  orgB: randomUUID(),
  actor: `wc007-actor-${randomUUID()}`,
  ranger: `wc007-ranger-${randomUUID()}`,
  sourceA: randomUUID(),
  observationA: randomUUID(),
  caseA: randomUUID(),
  caseB: randomUUID(),
  zoneA: randomUUID(),
  zoneB: randomUUID(),
  geometryA: randomUUID(),
  geometryB: randomUUID(),
  taskA: randomUUID(),
  findingA: randomUUID(),
  mediaA: randomUUID(),
  mediaB: randomUUID(),
};

function wc007ConnectionString() {
  loadEnvFile(".env.local");
  const source = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (
    !["postgres:", "postgresql:"].includes(source.protocol) ||
    source.hostname !== "127.0.0.1" ||
    source.port !== "5433" ||
    source.pathname !== "/auvrion_dev" ||
    decodeURIComponent(source.username) !== "auvrion_dev"
  ) {
    throw new Error("WC007_REFUSED_UNKNOWN_DEVELOPMENT_DATABASE");
  }
  source.port = "5435";
  source.pathname = "/auvrion_wc007_test";
  if (source.hostname !== "127.0.0.1" || source.port !== "5435") {
    throw new Error("WC007_REFUSED_UNKNOWN_TEST_DATABASE");
  }
  return source.toString();
}

const squareA = "MULTIPOLYGON(((114 -4,116 -4,116 -2,114 -2,114 -4)))";
const squareB =
  "MULTIPOLYGON(((115 -3.5,117 -3.5,117 -1.5,115 -1.5,115 -3.5)))";

// The fixture transaction remains open across tests, then ROLLBACK on teardown.
describe.skipIf(!ENABLED)(
  "WC-007 zones / tasks / evidence DB constraints (isolated)",
  () => {
    let pool: Pool | undefined;
    let client: PoolClient | undefined;

    function db() {
      if (!client) throw new Error("WC007_TEST_CONNECTION_NOT_ESTABLISHED");
      return client;
    }

    async function reject(
      statement: string,
      params: unknown[],
      pgCode: string,
    ) {
      await db().query("SAVEPOINT wc007_slice03_negative");
      try {
        await expect(db().query(statement, params)).rejects.toMatchObject({
          code: pgCode,
        });
      } finally {
        await db().query("ROLLBACK TO SAVEPOINT wc007_slice03_negative");
        await db().query("RELEASE SAVEPOINT wc007_slice03_negative");
      }
    }

    beforeAll(async () => {
      pool = new Pool({
        connectionString: wc007ConnectionString(),
        max: 1,
        connectionTimeoutMillis: 5000,
      });
      client = await pool.connect();
      const connection = db();
      await connection.query("BEGIN");
      const { rows } = await connection.query(
        "SELECT current_database() AS db, EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis') AS postgis",
      );
      if (rows[0]?.db !== "auvrion_wc007_test" || !rows[0]?.postgis) {
        throw new Error("WC007_NOT_ISOLATED_POSTGIS_DATABASE");
      }
      await connection.query(
        'INSERT INTO "organizations" ("id","code","name") VALUES ($1,$2,$3),($4,$5,$6)',
        [
          f.orgA,
          `WC007-${f.orgA}`,
          "WC007 Test A",
          f.orgB,
          `WC007-${f.orgB}`,
          "WC007 Test B",
        ],
      );
      await connection.query(
        'INSERT INTO "user" ("id","name","email") VALUES ($1,$2,$3),($4,$5,$6)',
        [
          f.actor,
          "WC007 Actor",
          `${f.actor}@example.invalid`,
          f.ranger,
          "WC007 Ranger",
          `${f.ranger}@example.invalid`,
        ],
      );
      await connection.query(
        'INSERT INTO "observation_sources" ("id","organization_id","kind","code","label") VALUES ($1,$2,\'manual\',\'MANUAL\',\'manual\')',
        [f.sourceA, f.orgA],
      );
      await connection.query(
        'INSERT INTO "observations" ("id","organization_id","source_id","domain","ingestion_mode","observed_at","latitude","longitude") VALUES ($1,$2,$3,\'environmental_risk\',\'historical\',now(),-3,115)',
        [f.observationA, f.orgA, f.sourceA],
      );
      await connection.query(
        'INSERT INTO "domain_cases" ("id","organization_id","title","opened_by_user_id") VALUES ($1,$2,\'Case A\',$3),($4,$5,\'Case B\',$3)',
        [f.caseA, f.orgA, f.actor, f.caseB, f.orgB],
      );
      await connection.query(
        'INSERT INTO "operational_zones" ("id","organization_id","code","name") VALUES ($1,$2,\'ZONE-A\',\'Zone A\'),($3,$4,\'ZONE-B\',\'Zone B\')',
        [f.zoneA, f.orgA, f.zoneB, f.orgB],
      );
      await connection.query(
        'INSERT INTO "zone_geometry_versions" ("id","organization_id","zone_id","geometry_version","boundary") VALUES ($1,$2,$3,1,ST_GeomFromText($4,4326)),($5,$6,$7,1,ST_GeomFromText($8,4326))',
        [
          f.geometryA,
          f.orgA,
          f.zoneA,
          squareA,
          f.geometryB,
          f.orgB,
          f.zoneB,
          squareB,
        ],
      );
      await connection.query(
        'INSERT INTO "domain_tasks" ("id","organization_id","case_id","title","created_by_user_id") VALUES ($1,$2,$3,\'Inspect site\',$4)',
        [f.taskA, f.orgA, f.caseA, f.actor],
      );
      await connection.query(
        'INSERT INTO "task_findings" ("id","organization_id","task_id","author_user_id","summary") VALUES ($1,$2,$3,$4,\'Field note\')',
        [f.findingA, f.orgA, f.taskA, f.ranger],
      );
      await connection.query(
        'INSERT INTO "evidence_media" ("id","organization_id","storage_key","created_by_user_id") VALUES ($1,$2,\'private/wc007-a\',$3),($4,$5,\'private/wc007-b\',$3)',
        [f.mediaA, f.orgA, f.actor, f.mediaB, f.orgB],
      );
    }, 25000);

    afterAll(async () => {
      try {
        await client?.query("ROLLBACK");
      } finally {
        client?.release();
        await pool?.end();
      }
    }, 20000);

    it("stores valid PostGIS geometry and uses EPSG:4326", async () => {
      const { rows } = await db().query(
        'SELECT ST_SRID(boundary) AS srid, ST_IsValid(boundary) AS valid, ST_GeometryType(boundary) AS kind FROM "zone_geometry_versions" WHERE id=$1',
        [f.geometryA],
      );
      expect(rows[0]).toEqual({
        srid: 4326,
        valid: true,
        kind: "ST_MultiPolygon",
      });
    });

    it("permits overlap between zones and keeps independent geometry revisions", async () => {
      const { rows } = await db().query(
        'SELECT ST_Intersects(a.boundary,b.boundary) AS overlaps FROM "zone_geometry_versions" a JOIN "zone_geometry_versions" b ON b.id=$2 WHERE a.id=$1',
        [f.geometryA, f.geometryB],
      );
      expect(rows[0]?.overlaps).toBe(true);
      const newId = randomUUID();
      await db().query(
        'INSERT INTO "zone_geometry_versions" ("id","organization_id","zone_id","geometry_version","boundary") VALUES ($1,$2,$3,2,ST_GeomFromText($4,4326))',
        [newId, f.orgA, f.zoneA, squareA],
      );
      const revisions = await db().query(
        'SELECT geometry_version FROM "zone_geometry_versions" WHERE zone_id=$1 ORDER BY geometry_version',
        [f.zoneA],
      );
      expect(revisions.rows.map((row) => row.geometry_version)).toEqual([1, 2]);
    });

    it("rejects invalid self-intersecting zone polygons", async () => {
      await reject(
        'INSERT INTO "zone_geometry_versions" ("organization_id","zone_id","geometry_version","boundary") VALUES ($1,$2,4,ST_GeomFromText($3,4326))',
        [
          f.orgA,
          f.zoneA,
          "MULTIPOLYGON(((114 -4,116 -2,116 -4,114 -2,114 -4)))",
        ],
        "23514",
      );
    });

    it("rejects cross-organization observation/zone matches", async () => {
      await reject(
        'INSERT INTO "observation_zone_matches" ("organization_id","observation_id","zone_geometry_version_id","match_method") VALUES ($1,$2,$3,\'intersects\')',
        [f.orgA, f.observationA, f.geometryB],
        "23503",
      );
    });

    it("enforces one active assignment while preserving reassignment history", async () => {
      const first = randomUUID();
      await db().query(
        'INSERT INTO "task_assignments" ("id","organization_id","task_id","ranger_user_id","assigned_by_user_id","reason") VALUES ($1,$2,$3,$4,$5,\'dispatch\')',
        [first, f.orgA, f.taskA, f.ranger, f.actor],
      );
      await reject(
        'INSERT INTO "task_assignments" ("organization_id","task_id","ranger_user_id","assigned_by_user_id","reason") VALUES ($1,$2,$3,$4,\'duplicate active\')',
        [f.orgA, f.taskA, f.ranger, f.actor],
        "23505",
      );
      await reject(
        'UPDATE "task_assignments" SET "unassigned_at" = now() WHERE id=$1',
        [first],
        "23514",
      );
      await db().query(
        'UPDATE "task_assignments" SET "unassigned_at" = now(), "unassigned_by_user_id"=$2 WHERE id=$1',
        [first, f.actor],
      );
      await db().query(
        'INSERT INTO "task_assignments" ("organization_id","task_id","ranger_user_id","assigned_by_user_id","reason") VALUES ($1,$2,$3,$4,\'new shift\')',
        [f.orgA, f.taskA, f.ranger, f.actor],
      );
      const { rows } = await db().query(
        'SELECT count(*)::int AS n FROM "task_assignments" WHERE task_id=$1',
        [f.taskA],
      );
      expect(rows[0]?.n).toBe(2);
    });

    it("rejects task membership across organizations", async () => {
      await reject(
        'INSERT INTO "domain_tasks" ("organization_id","case_id","title","created_by_user_id") VALUES ($1,$2,\'cross-org\',$3)',
        [f.orgA, f.caseB, f.actor],
        "23503",
      );
    });

    it("links evidence to exactly one target and same organization", async () => {
      await db().query(
        'INSERT INTO "evidence_links" ("organization_id","media_id","finding_id","linked_by_user_id") VALUES ($1,$2,$3,$4)',
        [f.orgA, f.mediaA, f.findingA, f.actor],
      );
      await reject(
        'INSERT INTO "evidence_links" ("organization_id","media_id","finding_id","observation_id","linked_by_user_id") VALUES ($1,$2,$3,$4,$5)',
        [f.orgA, f.mediaA, f.findingA, f.observationA, f.actor],
        "23514",
      );
      await reject(
        'INSERT INTO "evidence_links" ("organization_id","media_id","observation_id","linked_by_user_id") VALUES ($1,$2,$3,$4)',
        [f.orgA, f.mediaB, f.observationA, f.actor],
        "23503",
      );
    });

    it("rejects public media URLs and available status without validated metadata", async () => {
      await reject(
        'INSERT INTO "evidence_media" ("organization_id","storage_key","created_by_user_id") VALUES ($1,\'https://public.example/evidence.jpg\',$2)',
        [f.orgA, f.actor],
        "23514",
      );
      await reject(
        'UPDATE "evidence_media" SET "availability"=\'available\' WHERE id=$1',
        [f.mediaA],
        "23514",
      );
      const validHash = "a".repeat(64);
      await db().query(
        'UPDATE "evidence_media" SET "availability"=\'available\', "sha256"=$2, "mime_type"=\'image/jpeg\', "byte_length"=1024 WHERE id=$1',
        [f.mediaA, validHash],
      );
      const { rows } = await db().query(
        'SELECT "availability" FROM "evidence_media" WHERE id=$1',
        [f.mediaA],
      );
      expect(rows[0]?.availability).toBe("available");
    });
  },
);
