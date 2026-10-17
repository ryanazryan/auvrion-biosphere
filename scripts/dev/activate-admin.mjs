import { loadEnvFile } from "node:process";
import pg from "pg";

loadEnvFile(".env.local");

const connectionString = process.env.DATABASE_URL;
const adminEmail = "dev-admin@example.test";

if (process.env.ALLOW_LOCAL_ADMIN_ACTIVATION !== "YES") {
  throw new Error("Explicit local activation authorization required.");
}

if (process.env.NODE_ENV === "production" || !connectionString) {
  throw new Error("Local development only.");
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

const client = new pg.Client({ connectionString });
let transactionStarted = false;

try {
  await client.connect();
  await client.query("BEGIN");
  transactionStarted = true;

  // Serialize activation of this particular local admin.
  const result = await client.query(
    `
    SELECT
      u.id AS user_id,
      u.email_verified,
      u.two_factor_enabled,
      ua.status AS access_status,
      a.status AS application_status,
      a.email AS application_email,
      a.email_verified_at,
      a.reviewed_at,
      a.reviewed_by_id
    FROM "user" u
    JOIN user_access ua ON ua.user_id = u.id
    JOIN access_applications a ON a.id = ua.application_id
    WHERE u.email = $1
    FOR UPDATE OF ua
    `,
    [adminEmail],
  );

  if (result.rowCount !== 1) {
    throw new Error("Expected exactly one local administrator.");
  }

  const admin = result.rows[0];

  if (
    admin.email_verified !== true ||
    admin.two_factor_enabled !== true ||
    admin.access_status !== "pending_activation" ||
    admin.application_status !== "approved" ||
    admin.application_email.trim().toLowerCase() !== adminEmail ||
    !admin.email_verified_at ||
    !admin.reviewed_at ||
    !admin.reviewed_by_id
  ) {
    throw new Error("Administrator lifecycle prerequisites not met.");
  }

  const totp = await client.query(
    `
    SELECT 1
    FROM two_factor
    WHERE user_id = $1 AND verified = true
    LIMIT 1
    `,
    [admin.user_id],
  );

  if (totp.rowCount !== 1) {
    throw new Error("Verified TOTP enrollment required.");
  }

  const grants = await client.query(
    `
    SELECT DISTINCT g.capability
    FROM admin_capability_grants g
    JOIN organizations o ON o.id = g.organization_id
    WHERE g.user_id = $1
      AND o.code = 'AUVRION-LOCAL'
      AND g.revoked_at IS NULL
      AND g.capability IN ('review_applications', 'manage_access')
    `,
    [admin.user_id],
  );

  const capabilities = new Set(grants.rows.map((row) => row.capability));

  if (
    !capabilities.has("review_applications") ||
    !capabilities.has("manage_access")
  ) {
    throw new Error("Required local administrator grants missing.");
  }

  const updated = await client.query(
    `
    UPDATE user_access
    SET status = 'active'
    WHERE user_id = $1
      AND status = 'pending_activation'
    RETURNING user_id
    `,
    [admin.user_id],
  );

  if (updated.rowCount !== 1) {
    throw new Error("Administrator activation conflict.");
  }

  await client.query("COMMIT");
  transactionStarted = false;

  console.log("Local administrator activation completed.");
  console.log("Account:", adminEmail);
  console.log("User access: active");
  console.log("Admin MFA session assurance: still enforced separately.");
} catch (error) {
  if (transactionStarted) {
    await client.query("ROLLBACK").catch(() => {});
  }
  throw error;
} finally {
  await client.end();
}
