import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";

loadEnvFile(".env.local");

const url = process.env.DATABASE_URL;
const password = process.env.LOCAL_TEST_PASSWORD;

if (process.env.ALLOW_LOCAL_DEV_SEED !== "YES") {
  throw new Error("Local development seed is not authorized.");
}

if (process.env.NODE_ENV === "production" || !url) {
  throw new Error("Development-only script.");
}

const target = new URL(url);

if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  target.hostname !== "127.0.0.1" ||
  target.port !== "5433" ||
  target.pathname !== "/auvrion_dev" ||
  decodeURIComponent(target.username) !== "auvrion_dev"
) {
  throw new Error("Only the local development database is permitted.");
}

if (!password || password.length < 16) {
  throw new Error("Provide a test password of at least 16 characters.");
}

const email = "dev-operator@example.test";
const name = "Development Operator";
const id = randomUUID();

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

  const existing = await client.query('SELECT id FROM "user" LIMIT 1');

  if (existing.rowCount !== 0) {
    throw new Error(
      "Database already contains users. Refusing first-user seed.",
    );
  }

  const passwordHash = await hashPassword(password);

  await client.query(
    `INSERT INTO "user"
      (id, name, email, email_verified)
     VALUES ($1, $2, $3, true)`,
    [id, name, email],
  );

  await client.query(
    `INSERT INTO "account"
      (id, account_id, provider_id, user_id, password, updated_at)
     VALUES ($1, $2, 'credential', $3, $4, NOW())`,
    [randomUUID(), id, id, passwordHash],
  );

  const application = await client.query(
    `INSERT INTO access_applications
      (applicant_name, email, status, email_verified_at)
     VALUES ($1, $2, 'email_verified', NOW())
     RETURNING id`,
    [name, email],
  );

  await client.query(
    `INSERT INTO user_access
      (user_id, application_id, status)
     VALUES ($1, $2, 'pending_activation')`,
    [id, application.rows[0].id],
  );

  await client.query("COMMIT");

  console.log("Local test identity created.");
  console.log("Email:", email);
  console.log("Access: pending activation, no roles or capabilities");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
