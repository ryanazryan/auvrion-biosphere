/**
 * Auvrion Biosphere — Read-only Hard Delete Readiness Audit
 * Tidak menghapus atau mengubah database.
 * Hanya diperbolehkan menggunakan PostgreSQL lokal.
 */

import pg from "pg";

const keepArg = process.argv.find((arg) => arg.startsWith("--keep="));
const keepEmail = keepArg?.slice(7).trim().toLowerCase();
const databaseUrl = process.env.DATABASE_URL;

if (!keepEmail?.includes("@") || !databaseUrl) {
  console.error(
    "Usage: node --env-file=.env.local scripts/dev/auvrion-hard-delete-readiness.mjs --keep=dev-admin@example.test",
  );
  process.exit(2);
}

let parsed;
try {
  parsed = new URL(databaseUrl);
} catch {
  console.error("Invalid DATABASE_URL");
  process.exit(2);
}

if (
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname)
) {
  console.error(
    "REFUSED: audit hanya boleh menggunakan database PostgreSQL lokal.",
  );
  process.exit(2);
}

const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
});

let client;

try {
  client = await pool.connect();
  await client.query("BEGIN READ ONLY");

  // 1. Daftar akun
  const { rows: people } = await client.query(`
    SELECT
      u.id,
      u.name,
      u.email,
      COALESCE(ua.status::text, 'NO_ACCESS_ROW') AS access_status,
      EXISTS (
        SELECT 1
        FROM admin_capability_grants ac
        WHERE ac.user_id = u.id
          AND ac.revoked_at IS NULL
      ) AS is_admin,
      (
        SELECT COUNT(*)::integer
        FROM "session" s
        WHERE s.user_id = u.id
      ) AS session_rows,
      (
        SELECT COUNT(*)::integer
        FROM "session" s
        WHERE s.user_id = u.id
          AND s.expires_at > NOW()
      ) AS nonexpired_session_rows
    FROM "user" u
    LEFT JOIN user_access ua ON ua.user_id = u.id
    ORDER BY u.email
  `);

  console.log("=== ACCOUNT INVENTORY (READ ONLY) ===");

  console.table(
    people.map(({ id, ...person }) => ({
      ...person,
      action:
        person.email.toLowerCase() === keepEmail
          ? "KEEP"
          : person.is_admin
            ? "REVIEW OTHER ADMIN"
            : "CANDIDATE",
    })),
  );

  const protectedAdmins = people.filter(
    (person) =>
      person.email.toLowerCase() === keepEmail &&
      person.is_admin &&
      person.access_status === "active",
  );

  if (protectedAdmins.length !== 1) {
    console.error(
      "WARNING: Admin yang harus dipertahankan tidak valid. Jangan menghapus akun.",
    );
  }

  const candidates = people.filter(
    (person) => person.email.toLowerCase() !== keepEmail,
  );

  const candidateIds = candidates.map((person) => person.id);

  const emailById = new Map(
    candidates.map((person) => [person.id, person.email]),
  );

  // 2. Temukan seluruh FK ke tabel user
  const { rows: userRefs } = await client.query(`
    SELECT
      ns.nspname AS schema_name,
      cls.relname AS table_name,
      att.attname AS column_name,
      c.conname AS fk_name,
      CASE c.confdeltype
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
        ELSE c.confdeltype::text
      END AS on_delete
    FROM pg_constraint c
    JOIN pg_class cls ON cls.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    JOIN pg_attribute att
      ON att.attrelid = c.conrelid
      AND att.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = to_regclass('public.user')
      AND array_length(c.conkey, 1) = 1
    ORDER BY ns.nspname, cls.relname, att.attname
  `);

  const references = [];

  for (const fk of userRefs) {
    if (candidateIds.length === 0) break;

    const table = `${quote(fk.schema_name)}.${quote(fk.table_name)}`;
    const column = quote(fk.column_name);

    const { rows } = await client.query(
      `
      SELECT
        ${column}::text AS user_id,
        COUNT(*)::integer AS references
      FROM ${table}
      WHERE ${column} = ANY($1::text[])
      GROUP BY ${column}
      ORDER BY ${column}
      `,
      [candidateIds],
    );

    for (const row of rows) {
      references.push({
        account: emailById.get(row.user_id) ?? "UNKNOWN",
        table: fk.table_name,
        column: fk.column_name,
        count: row.references,
        on_delete: fk.on_delete,
      });
    }
  }

  console.log("=== ACTUAL USER REFERENCES (NONZERO COUNTS ONLY) ===");
  console.table(references);

  const protectedReferences = references.filter(
    (reference) =>
      reference.on_delete !== "CASCADE" &&
      /ingestion_|listen_device_installations|domain_cases|domain_tasks|case_|task_|report_|observation_|evidence_/.test(
        reference.table,
      ),
  );

  if (protectedReferences.length > 0) {
    console.warn(
      "ATTENTION: ditemukan referensi perangkat, bukti, Case, atau audit yang memerlukan penanganan khusus.",
    );
    console.table(protectedReferences);
  }

  // 3. Riwayat permohonan akses
  const { rows: applications } = await client.query(
    `
    SELECT
      a.id,
      a.applicant_name,
      a.email,
      a.status::text AS status,
      EXISTS (
        SELECT 1
        FROM user_access ua
        JOIN "user" u ON u.id = ua.user_id
        WHERE ua.application_id = a.id
          AND LOWER(u.email) = $1
      ) AS protects_keep_admin
    FROM access_applications a
    ORDER BY a.created_at
    `,
    [keepEmail],
  );

  console.log("=== APPLICATION RECORDS (READ ONLY) ===");

  console.table(
    applications.map(({ id, ...application }) => ({
      ...application,
      action: application.protects_keep_admin
        ? "KEEP_ADMIN_DEPENDENCY"
        : "REVIEW_FOR_PURGE",
    })),
  );

  const applicantIds = applications
    .filter((application) => !application.protects_keep_admin)
    .map((application) => application.id);

  // 4. Foreign key riwayat pemohon
  const { rows: appRefs } = await client.query(`
    SELECT
      ns.nspname AS schema_name,
      cls.relname AS table_name,
      att.attname AS column_name,
      c.conname AS fk_name,
      CASE c.confdeltype
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
        ELSE c.confdeltype::text
      END AS on_delete
    FROM pg_constraint c
    JOIN pg_class cls ON cls.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    JOIN pg_attribute att
      ON att.attrelid = c.conrelid
      AND att.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = to_regclass('public.access_applications')
      AND array_length(c.conkey, 1) = 1
    ORDER BY ns.nspname, cls.relname, att.attname
  `);

  const appReferences = [];

  for (const fk of appRefs) {
    if (applicantIds.length === 0) break;

    const table = `${quote(fk.schema_name)}.${quote(fk.table_name)}`;
    const column = quote(fk.column_name);

    const { rows } = await client.query(
      `
      SELECT COUNT(*)::integer AS referencing_rows
      FROM ${table}
      WHERE ${column} = ANY($1::uuid[])
      `,
      [applicantIds],
    );

    if (rows[0].referencing_rows > 0) {
      appReferences.push({
        table: fk.table_name,
        column: fk.column_name,
        count: rows[0].referencing_rows,
        on_delete: fk.on_delete,
      });
    }
  }

  console.log("=== APPLICATION DEPENDENCIES ===");
  console.table(appReferences);

  // 5. Data yang harus dipertahankan
  const { rows: counts } = await client.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM ingestion_devices) AS devices,
      (SELECT COUNT(*)::integer FROM ingestion_recordings) AS recordings,
      (SELECT COUNT(*)::integer FROM observations) AS observations,
      (SELECT COUNT(*)::integer FROM domain_cases) AS cases,
      (SELECT COUNT(*)::integer FROM domain_tasks) AS tasks
  `);

  console.log("=== PRESERVE ASSETS (READ ONLY) ===");
  console.table(counts);

  console.log("READ-ONLY AUDIT COMPLETE. Tidak ada data yang diubah.");

  await client.query("ROLLBACK");
} catch (error) {
  console.error("Audit failed:", error?.message ?? "unknown error");

  process.exitCode = 1;

  if (client) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Transaksi mungkin sudah gagal.
    }
  }
} finally {
  client?.release();
  await pool.end();
}
