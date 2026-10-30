/**
 * One-time, explicitly authorized local-development Admin capability addition.
 * The existing bootstrap-admin.mjs provisions only review_applications and manage_access.
 * Not a production role-management or privilege-escalation endpoint.
 *
 * Usage (from repository root):
 *   ALLOW_LOCAL_DEVICE_GRANT=YES node scripts/dev/grant-local-device-admin.mjs
 */
import { loadEnvFile } from "node:process";
import pg from "pg";

if (process.env.ALLOW_LOCAL_DEVICE_GRANT !== "YES") {
  throw new Error(
    "Set ALLOW_LOCAL_DEVICE_GRANT=YES for explicit local authorization.",
  );
}
if (process.env.NODE_ENV === "production") {
  throw new Error(
    "Local development only; production grants require administrative approval.",
  );
}

loadEnvFile(".env.local");
if (process.env.NODE_ENV === "production") {
  throw new Error("Local development only.");
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL missing");
const url = new URL(connectionString);
if (
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "5433" ||
  url.pathname !== "/auvrion_dev" ||
  decodeURIComponent(url.username) !== "auvrion_dev"
) {
  throw new Error("Unexpected database target; refusing privilege change.");
}

const adminEmail = "dev-admin@example.test";
const client = new pg.Client({ connectionString });
let inTransaction = false;
try {
  await client.connect();
  await client.query("BEGIN");
  inTransaction = true;
  await client.query("SELECT pg_advisory_xact_lock(2026, 2017)");
  const result = await client.query(
    `SELECT u.id AS user_id, u.email_verified, u.two_factor_enabled,
            ua.status AS access_status, org.id AS organization_id
       FROM "user" u
       JOIN user_access ua ON ua.user_id = u.id
       CROSS JOIN organizations org
      WHERE u.email = $1 AND org.code = 'AUVRION-LOCAL'
      FOR UPDATE OF ua`,
    [adminEmail],
  );
  if (result.rowCount !== 1) {
    throw new Error(
      "Exactly one local development Admin account and organization are required.",
    );
  }
  const admin = result.rows[0];
  if (
    !admin.email_verified ||
    !admin.two_factor_enabled ||
    admin.access_status !== "active"
  ) {
    throw new Error(
      "Local Admin must be active, verified, and have MFA enabled.",
    );
  }
  const mfa = await client.query(
    "SELECT 1 FROM two_factor WHERE user_id = $1 AND verified = true LIMIT 1",
    [admin.user_id],
  );
  if (mfa.rowCount !== 1) {
    throw new Error("Verified TOTP enrollment required.");
  }
  const grants = await client.query(
    `SELECT capability FROM admin_capability_grants
       WHERE user_id = $1 AND organization_id = $2 AND revoked_at IS NULL`,
    [admin.user_id, admin.organization_id],
  );
  const active = new Set(grants.rows.map((row) => row.capability));
  if (!active.has("manage_access") || !active.has("review_applications")) {
    throw new Error("Existing local bootstrap Admin grants not present.");
  }
  if (active.has("manage_devices")) {
    console.log(
      "No change: manage_devices is already active for local development Admin.",
    );
  } else {
    await client.query(
      `INSERT INTO admin_capability_grants
        (user_id, organization_id, capability, granted_by_id)
       VALUES ($1, $2, 'manage_devices'::admin_capability, $1)`,
      [admin.user_id, admin.organization_id],
    );
    console.log(
      "Local development Admin granted manage_devices. MFA enforcement remains unchanged.",
    );
  }
  await client.query("COMMIT");
  inTransaction = false;
  console.log("Organization: AUVRION-LOCAL");
  console.log(
    "Device management: permitted subject to verified MFA session assurance",
  );
} catch (error) {
  if (inTransaction) await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
