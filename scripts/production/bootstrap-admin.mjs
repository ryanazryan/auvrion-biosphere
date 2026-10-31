import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";

const DECISION = "PRODUCTION FIRST ADMIN: owner-authorized one-time bootstrap";

const ORGANIZATION_CODE = "AUVRION-LOCAL";
const ORGANIZATION_NAME = "Auvrion Biosphere";

async function readPasswordFromStdin() {
  let value = "";
  for await (const chunk of process.stdin) {
    value += chunk.toString("utf8");

    if (Buffer.byteLength(value, "utf8") > 512) {
      throw new Error("Password input too large");
    }
  }

  return value.replace(/\r?\n$/, "");
}

async function main() {
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_PRODUCTION_ADMIN_BOOTSTRAP !== "YES"
  ) {
    throw new Error("Production bootstrap authorization required");
  }

  const email = process.env.PRODUCTION_ADMIN_EMAIL?.trim().toLowerCase();

  const name = process.env.PRODUCTION_ADMIN_NAME?.trim();
  const connectionString = process.env.DATABASE_URL;

  if (!email || !name || !connectionString) {
    throw new Error("Missing owner identity or database configuration");
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email === "dev-admin@example.test" ||
    name.length > 200
  ) {
    throw new Error("Invalid production administrator identity");
  }

  const target = new URL(connectionString);

  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.hostname !== "database" ||
    (target.port && target.port !== "5432") ||
    !target.pathname ||
    target.pathname === "/" ||
    target.pathname === "/auvrion_dev"
  ) {
    throw new Error("Unexpected production database target");
  }

  const password = await readPasswordFromStdin();

  if (password.length < 16 || password.length > 128 || !password.trim()) {
    throw new Error("Admin password must contain 16-128 characters");
  }

  const hashedPassword = await hashPassword(password);
  const client = new pg.Client({ connectionString });

  let transactionStarted = false;

  try {
    await client.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // Serialize concurrent bootstrap attempts.
    await client.query("SELECT pg_advisory_xact_lock(2026, 3101)");

    // This bootstrap is exclusively for a completely new
    // production identity database.
    const tables = [
      '"user"',
      "account",
      "organizations",
      "access_applications",
      "user_access",
      "admin_capability_grants",
      "role_grants",
      "account_activation_invites",
    ];

    for (const table of tables) {
      const result = await client.query(
        `SELECT EXISTS (SELECT 1 FROM ${table}) AS occupied`,
      );

      if (result.rows[0]?.occupied !== false) {
        throw new Error(`Bootstrap denied: ${table} is not empty`);
      }
    }

    const userId = randomUUID();
    const applicationId = randomUUID();
    const organizationId = randomUUID();

    await client.query(
      `INSERT INTO "user"
       (id, name, email, email_verified, two_factor_enabled)
       VALUES ($1, $2, $3, true, false)`,
      [userId, name, email],
    );

    await client.query(
      `INSERT INTO account
       (id, account_id, provider_id, user_id, password, updated_at)
       VALUES ($1, $2, 'credential', $3, $4, NOW())`,
      [randomUUID(), userId, userId, hashedPassword],
    );

    await client.query(
      `INSERT INTO access_applications
       (id, applicant_name, email, status,
        email_verified_at, reviewed_by_id,
        reviewed_at, decision_reason)
       VALUES
       ($1, $2, $3, 'approved',
        NOW(), $4, NOW(), $5)`,
      [applicationId, name, email, userId, DECISION],
    );

    await client.query(
      `INSERT INTO user_access
       (user_id, application_id, status)
       VALUES ($1, $2, 'pending_activation')`,
      [userId, applicationId],
    );

    await client.query(
      `INSERT INTO organizations
       (id, code, name)
       VALUES ($1, $2, $3)`,
      [organizationId, ORGANIZATION_CODE, ORGANIZATION_NAME],
    );

    for (const capability of ["review_applications", "manage_access"]) {
      await client.query(
        `INSERT INTO admin_capability_grants
         (user_id, organization_id, capability, granted_by_id)
         VALUES ($1, $2, $3::admin_capability, $4)`,
        [userId, organizationId, capability, userId],
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    console.log("PRODUCTION_ADMIN_BOOTSTRAP_CREATED");
    console.log("Account status: pending_activation");
    console.log("MFA enrollment: required");
    console.log("Operational access: not yet activated");
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => undefined);
    }

    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    "Bootstrap failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
