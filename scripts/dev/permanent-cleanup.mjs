/**
 * Auvrion Biosphere LOCAL DEVELOPMENT ONLY — targeted permanent purge.
 * Preview by default. Execute only with explicit confirmation flag.
 * Preserves: Admin, organizations, observations, ingestion and LISTEN device records.
 * Deletes: all non-admin users, non-admin access applications, all demo cases/tasks,
 *          and all FK-dependent records required for a consistent database.
 * Physical evidence files are NOT deleted.
 */
import pg from "pg";

const KEEP = "dev-admin@example.test";
const CONFIRM = "PURGE_DEMO_ACCOUNTS_CASES_AND_APPLICATIONS";
const execute = process.argv.includes(`--execute=${CONFIRM}`);
const expected = process.argv
  .find((x) => x.startsWith("--keep="))
  ?.slice(7)
  .trim()
  .toLowerCase();
if (expected !== KEEP) throw Error(`Refusing: use --keep=${KEEP}`);
const urlText = process.env.DATABASE_URL;
if (!urlText) throw Error("Missing DATABASE_URL in .env.local");
const url = new URL(urlText);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/auvrion_dev" ||
  process.env.NODE_ENV === "production"
) {
  throw Error("REFUSED: this script only runs against local auvrion_dev");
}
const quote = (x) => `"${String(x).replaceAll('"', '""')}"`;
const pool = new pg.Pool({ connectionString: urlText, max: 1 });
const protectedTables = new Set([
  "user:admin",
  "organizations",
  "observations",
  "observation_sources",
  "observation_provenance",
  "observation_zone_matches",
  "operational_zones",
  "zone_geometry_versions",
  "environmental_measurements",
  "ecosystem_profiles",
  "ingestion_devices",
  "ingestion_recordings",
  "ingestion_device_credentials",
  "ingestion_device_events",
  "listen_device_installations",
  "listen_remote_controls",
  "spatial_ref_sys",
  "__drizzle_migrations",
]);
const requiredTables = [
  "user",
  "access_applications",
  "domain_cases",
  "domain_tasks",
  "ingestion_devices",
  "ingestion_recordings",
  "observations",
];
const keyOf = (table, row, pks) =>
  `${table}:${JSON.stringify(pks.map((k) => row[k]))}`;
const tableSQL = (t) => `${quote("public")}.${quote(t)}`;
const snapshots = async (client) => {
  const r = await client.query(`SELECT
    (SELECT COUNT(*)::integer FROM ingestion_devices) devices,
    (SELECT COUNT(*)::integer FROM ingestion_recordings) recordings,
    (SELECT COUNT(*)::integer FROM observations) observations,
    (SELECT COUNT(*)::integer FROM observation_sources) sources,
    (SELECT COUNT(*)::integer FROM listen_device_installations) installations`);
  return r.rows[0];
};

let client;
try {
  client = await pool.connect();
  await client.query(
    execute
      ? "BEGIN ISOLATION LEVEL REPEATABLE READ"
      : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );
  await client.query("SET LOCAL lock_timeout = '5000ms'");
  await client.query("SET LOCAL statement_timeout = '60000ms'");
  // pg_catalog: constrain discovery to public tables, and reject unhandled cross-schema FK references.
  const { rows: pksRows } = await client.query(`
    SELECT t.relname AS table_name, array_agg(a.attname ORDER BY k.ord)::text[] AS cols
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum,ord) ON true
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum
    WHERE c.contype='p' AND ns.nspname='public'
    GROUP BY t.relname`);
  const pks = new Map(pksRows.map((r) => [r.table_name, r.cols]));
  for (const t of requiredTables)
    if (!pks.has(t)) throw Error(`Missing expected table or PK: ${t}`);
  const { rows: fkRows } = await client.query(`
    SELECT c.conname AS name, child.relname AS child, parent.relname AS parent,
      childns.nspname AS child_schema, parentns.nspname AS parent_schema,
      array_agg(ca.attname ORDER BY k.ord)::text[] AS child_cols,
      array_agg(pa.attname ORDER BY k.ord)::text[] AS parent_cols
    FROM pg_constraint c
    JOIN pg_class child ON child.oid=c.conrelid
    JOIN pg_class parent ON parent.oid=c.confrelid
    JOIN pg_namespace childns ON childns.oid=child.relnamespace
    JOIN pg_namespace parentns ON parentns.oid=parent.relnamespace
    JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY k(child_att,parent_att,ord) ON true
    JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=k.child_att
    JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=k.parent_att
    WHERE c.contype='f' AND parentns.nspname='public'
    GROUP BY c.conname,child.relname,parent.relname,childns.nspname,parentns.nspname`);
  const cross = fkRows.filter((f) => f.child_schema !== "public");
  if (cross.length) {
    throw new Error(
      `Cross-schema FK exists; manual review required: ${cross.map((x) => x.name).join(",")}`,
    );
  }
  const byParent = new Map();
  for (const fk of fkRows) {
    const arr = byParent.get(fk.parent) ?? [];
    arr.push(fk);
    byParent.set(fk.parent, arr);
  }
  const before = await snapshots(client);
  // One query at a time per pg client; concurrent client.query calls are deprecated.
  const users = await client.query(
    `SELECT to_jsonb(u) AS row FROM "user" u ORDER BY email`,
  );
  const apps = await client.query(
    `SELECT to_jsonb(a) AS row FROM access_applications a`,
  );
  const cases = await client.query(
    `SELECT to_jsonb(c) AS row FROM domain_cases c`,
  );
  const tasks = await client.query(
    `SELECT to_jsonb(t) AS row FROM domain_tasks t`,
  );
  const admin = users.rows.filter(
    ({ row }) => row.email.toLowerCase() === KEEP,
  );
  if (admin.length !== 1) throw Error("Protected Admin missing/duplicated");
  const { rows: adminAccess } = await client.query(
    `SELECT status::text AS status FROM user_access WHERE user_id=$1`,
    [admin[0].row.id],
  );
  const { rows: adminGrant } = await client.query(
    `SELECT COUNT(*)::integer AS n FROM admin_capability_grants WHERE user_id=$1 AND revoked_at IS NULL`,
    [admin[0].row.id],
  );
  if (adminAccess[0]?.status !== "active" || adminGrant[0]?.n < 1)
    throw Error("Protected Admin not active");
  const candidates = users.rows.filter(
    ({ row }) => row.email.toLowerCase() !== KEEP,
  );
  const { rows: othersAdmin } = await client.query(
    `SELECT DISTINCT u.email FROM admin_capability_grants g JOIN "user" u ON u.id=g.user_id WHERE g.revoked_at IS NULL AND u.id<>$1`,
    [admin[0].row.id],
  );
  if (othersAdmin.length)
    throw Error("Other active Admin detected; refusing automatic purge");
  const keepApps = new Set(
    (
      await client.query(
        `SELECT application_id::text AS id FROM user_access WHERE user_id=$1 AND application_id IS NOT NULL`,
        [admin[0].row.id],
      )
    ).rows.map((r) => r.id),
  );
  const appCandidates = apps.rows.filter(({ row }) => !keepApps.has(row.id));
  const targets = new Map();
  const queue = [];
  function add(t, row) {
    if (protectedTables.has(t)) throw Error(`PROTECTED TABLE reached: ${t}`);
    if (t === "user" && row.id === admin[0].row.id)
      throw Error("Protected Admin reached");
    const cols = pks.get(t);
    if (!cols) throw Error(`No PK for target table ${t}`);
    const key = keyOf(t, row, cols);
    if (targets.has(key)) return;
    if (targets.size >= 30000) throw Error("Safety cap exceeded: 30000 rows");
    targets.set(key, { t, row, cols, key });
    queue.push({ t, row, key });
  }
  for (const r of candidates) add("user", r.row);
  for (const r of appCandidates) add("access_applications", r.row);
  for (const r of cases.rows) add("domain_cases", r.row);
  for (const r of tasks.rows) add("domain_tasks", r.row);
  // Closure of all incoming FK references. No CASCADE or disabled constraints.
  while (queue.length) {
    const { t, row } = queue.shift();
    for (const fk of byParent.get(t) ?? []) {
      const vals = fk.parent_cols.map((c) => row[c]);
      if (vals.some((v) => v === null || v === undefined)) continue;
      const where = fk.child_cols
        .map((c, i) => `${quote(c)}=$${i + 1}`)
        .join(" AND ");
      const { rows } = await client.query(
        `SELECT to_jsonb(x) AS row FROM ${tableSQL(fk.child)} x WHERE ${where}`,
        vals,
      );
      if (rows.length && protectedTables.has(fk.child))
        throw Error(
          `REFUSED: would touch protected ${fk.child} via ${fk.name}; ${rows.length} rows`,
        );
      for (const r of rows) add(fk.child, r.row);
    }
  }
  const counts = new Map();
  for (const x of targets.values()) counts.set(x.t, (counts.get(x.t) ?? 0) + 1);
  console.log("=== PERMANENT CLEANUP PLAN ===");
  console.log("Mode:", execute ? "EXECUTE" : "PREVIEW ONLY");
  console.log("Protected Admin:", KEEP);
  console.log(
    "Users to delete:",
    candidates.map((x) => x.row.email).join(", "),
  );
  console.log("Applications to delete:", appCandidates.length);
  console.log("Demo cases/tasks:", cases.rows.length, "/", tasks.rows.length);
  console.log("Preserved baseline:", before);
  console.table(
    [...counts]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([table, count]) => ({ table, count })),
  );
  if (!execute) {
    console.log(`PREVIEW COMPLETE. Execute with --execute=${CONFIRM}`);
    await client.query("ROLLBACK");
  } else {
    // Delete child tables before parents. Refuse if cyclic FK graphs cannot be ordered.
    const tables = new Set(counts.keys());
    const dependencies = new Map([...tables].map((t) => [t, new Set()]));
    for (const fk of fkRows)
      if (
        tables.has(fk.child) &&
        tables.has(fk.parent) &&
        fk.child !== fk.parent
      )
        dependencies.get(fk.parent).add(fk.child);
    const order = [];
    while (dependencies.size) {
      const ready = [...dependencies]
        .filter(([, children]) =>
          [...children].every((c) => !dependencies.has(c)),
        )
        .map(([t]) => t)
        .sort();
      if (!ready.length)
        throw Error(
          "Circular FK dependency. No data deleted; manual review required.",
        );
      for (const t of ready) {
        order.push(t);
        dependencies.delete(t);
      }
    }
    for (const t of order) {
      const entries = [...targets.values()].filter((x) => x.t === t);
      for (const { row, cols } of entries) {
        const where = cols.map((c, i) => `${quote(c)}=$${i + 1}`).join(" AND ");
        const result = await client.query(
          `DELETE FROM ${tableSQL(t)} WHERE ${where}`,
          cols.map((c) => row[c]),
        );
        if (result.rowCount !== 1)
          throw Error(`Unexpected delete count in ${t}: ${result.rowCount}`);
      }
    }
    const after = await snapshots(client);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw Error("Protected asset counts changed. ROLLBACK.");
    const { rows: remaining } = await client.query(`SELECT email FROM "user"`);
    if (remaining.length !== 1 || remaining[0].email.toLowerCase() !== KEEP)
      throw Error("Unexpected remaining user state. ROLLBACK.");
    const { rows: adminAgain } = await client.query(
      `SELECT status::text AS status FROM user_access WHERE user_id=$1`,
      [admin[0].row.id],
    );
    if (adminAgain[0]?.status !== "active")
      throw Error("Admin disabled! ROLLBACK.");
    await client.query("COMMIT");
    console.log(
      "PERMANENT CLEANUP COMMITTED. Post-cleanup protected counts:",
      after,
    );
    console.log("Physical WAV files were not modified.");
  }
} catch (e) {
  if (client) {
    try {
      await client.query("ROLLBACK");
    } catch {}
  }
  console.error("ABORTED / ROLLED BACK:", e.message);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
