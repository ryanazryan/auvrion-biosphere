/** Read-only inspection. No DELETE, UPDATE, TRUNCATE or user mutation. */
import pg from "pg";

const keepArg = process.argv.find((arg) => arg.startsWith("--keep="));
if (!keepArg?.slice(7).includes("@")) {
  console.error(
    "Usage: node --env-file=.env.local scripts/dev/audit-accounts.mjs --keep=dev-admin@example.test",
  );
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not configured");
  process.exit(2);
}
const keep = keepArg.slice(7).trim().toLowerCase();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const users = await client.query(`
      SELECT u.id, u.name, u.email, ua.status::text AS access_status,
             EXISTS (SELECT 1 FROM admin_capability_grants g
                WHERE g.user_id = u.id AND g.revoked_at IS NULL) AS is_admin,
             COALESCE((SELECT string_agg(DISTINCT r.role::text, ', ')
                FROM role_grants r WHERE r.user_id = u.id AND r.revoked_at IS NULL), '') AS roles,
             (SELECT COUNT(*)::int FROM "session" s WHERE s.user_id = u.id) AS active_session_rows
      FROM "user" u
      LEFT JOIN user_access ua ON ua.user_id = u.id
      ORDER BY u.email
    `);
    console.log("=== ACCOUNT CLEANUP PREVIEW (READ ONLY) ===");
    console.table(
      users.rows.map(({ id, ...row }) => ({
        ...row,
        retain: row.email.toLowerCase() === keep ? "KEEP" : "REVIEW",
      })),
    );
    const adminsToKeep = users.rows.filter(
      (row) => row.email.toLowerCase() === keep && row.is_admin,
    );
    if (adminsToKeep.length !== 1) {
      console.warn(
        "WARNING: The KEEP identity is not exactly one active Admin. Do NOT delete or disable accounts.",
      );
    }
    // Reference constraints to user prevent unsafe hard-deletion of audited actors.
    const refs = await client.query(`
      SELECT c.conrelid::regclass::text AS referencing_table,
             c.conname AS foreign_key_name,
             CASE c.confdeltype WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
               WHEN 'a' THEN 'NO ACTION' ELSE c.confdeltype::text END AS on_delete
      FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confrelid = 'public.user'::regclass
      ORDER BY 1, 2
    `);
    console.log("=== USER REFERENCE CONSTRAINTS ===");
    console.table(refs.rows);
    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM ingestion_devices) AS ingestion_devices,
        (SELECT COUNT(*)::int FROM ingestion_recordings) AS ingestion_recordings,
        (SELECT COUNT(*)::int FROM observations) AS observations,
        (SELECT COUNT(*)::int FROM domain_cases) AS domain_cases,
        (SELECT COUNT(*)::int FROM domain_tasks) AS domain_tasks
    `);
    console.log("=== PRESERVE / DO NOT MUTATE ===");
    console.table(counts.rows);
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
} catch (error) {
  console.error("Read-only audit failed:", error?.message ?? "unknown error");
  process.exitCode = 1;
} finally {
  await pool.end();
}
