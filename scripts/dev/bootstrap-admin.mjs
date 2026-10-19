import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";

loadEnvFile(".env.local");

const connectionString = process.env.DATABASE_URL;
const password = process.env.LOCAL_ADMIN_PASSWORD;

const email = "dev-admin@example.test";
const name = "Development Administrator";

if (process.env.ALLOW_LOCAL_ADMIN_BOOTSTRAP !== "YES") {
  throw new Error("Explicit local bootstrap authorization required.");
}

if (process.env.NODE_ENV === "production" || !connectionString) {
  throw new Error("This script is restricted to local development.");
}

const target = new URL(connectionString);

if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  target.hostname !== "127.0.0.1" ||
  target.port !== "5433" ||
  target.pathname !== "/auvrion_dev" ||
  decodeURIComponent(target.username) !== "auvrion_dev"
) {
  throw new Error("Unexpected database target. Aborting.");
}

if (!password || password.length < 16) {
  throw new Error("A password of at least 16 characters is required.");
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();

  const hashedPassword = await hashPassword(password);
  const userId = randomUUID();

  await client.query("BEGIN");

  await client.query("SELECT pg_advisory_xact_lock(2026, 2002)");

  const existingAdmin = await client.query(
    "SELECT id FROM admin_capability_grants LIMIT 1",
  );

  if (existingAdmin.rowCount !== 0) {
    throw new Error("Bootstrap already initialized or admin grants exist.");
  }

  const duplicate = await client.query(
    'SELECT id FROM "user" WHERE email = $1',
    [email],
  );

  if (duplicate.rowCount !== 0) {
    throw new Error("Bootstrap identity already exists.");
  }

  await client.query(
    `INSERT INTO "user" (id, name, email, email_verified)
     VALUES ($1, $2, $3, true)`,
    [userId, name, email],
  );

  await client.query(
    `INSERT INTO account
       (id, account_id, provider_id, user_id, password, updated_at)
     VALUES ($1, $2, 'credential', $3, $4, NOW())`,
    [randomUUID(), userId, userId, hashedPassword],
  );

  const application = await client.query(
    `INSERT INTO access_applications
       (applicant_name, email, status, email_verified_at,
        reviewed_by_id, reviewed_at, decision_reason)
     VALUES ($1, $2, 'approved', NOW(), $3, NOW(), $4)
     RETURNING id`,
    [
      name,
      email,
      userId,
      "LOCAL DEVELOPMENT ONLY: owner-controlled first-admin bootstrap exception",
    ],
  );

  await client.query(
    `INSERT INTO user_access
       (user_id, application_id, status)
     VALUES ($1, $2, 'pending_activation')`,
    [userId, application.rows[0].id],
  );

  await client.query(
    `INSERT INTO organizations (code, name)
     VALUES ('AUVRION-LOCAL', 'Auvrion Development')
     ON CONFLICT (code) DO NOTHING`,
  );

  const organization = await client.query(
    "SELECT id FROM organizations WHERE code = 'AUVRION-LOCAL'",
  );

  if (organization.rowCount !== 1) {
    throw new Error("Development organization unavailable.");
  }

  for (const capability of ["review_applications", "manage_access"]) {
    await client.query(
      `INSERT INTO admin_capability_grants
         (user_id, organization_id, capability, granted_by_id)
       VALUES ($1, $2, $3::admin_capability, $4)`,
      [userId, organization.rows[0].id, capability, userId],
    );
  }

  await client.query("COMMIT");

  console.log("Local development bootstrap created.");
  console.log("Email:", email);
  console.log("Account status: pending_activation");
  console.log("MFA: not enrolled");
  console.log("Operational access: denied");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
