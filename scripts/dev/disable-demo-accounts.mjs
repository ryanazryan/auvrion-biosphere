/** Local-only, review-first soft-deactivation. Preserves audit, devices and WAV receipts. */
import pg from "pg";

const keepArg = process.argv.find((arg) => arg.startsWith("--keep="));
const keepEmail = keepArg?.slice(7).trim().toLowerCase();
const execute = process.argv.includes("--execute=DISABLE_NON_ADMIN_USERS");
if (!keepEmail?.includes("@") || !process.env.DATABASE_URL) {
  console.error(
    "Usage: node --env-file=.env.local scripts/dev/disable-demo-accounts.mjs --keep=dev-admin@example.test [--execute=DISABLE_NON_ADMIN_USERS]",
  );
  process.exit(2);
}

const address = new URL(process.env.DATABASE_URL);
if (
  !["127.0.0.1", "localhost"].includes(address.hostname) ||
  address.pathname !== "/auvrion_dev"
) {
  console.error(
    "REFUSED: this operation is allowed ONLY for local database auvrion_dev on localhost. Never run on hosted DB.",
  );
  process.exit(2);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const users = await client.query(`
      SELECT u.id, u.name, u.email, a.status::text AS access_status,
        EXISTS (SELECT 1 FROM admin_capability_grants g WHERE g.user_id=u.id AND g.revoked_at IS NULL) AS is_admin
      FROM "user" u LEFT JOIN user_access a ON a.user_id=u.id
      ORDER BY u.email FOR UPDATE OF u
    `);
    const retained = users.rows.find(
      (r) => r.email.trim().toLowerCase() === keepEmail,
    );
    if (!retained?.is_admin || retained.access_status !== "active") {
      throw new Error(
        "KEEP account is not an active Administrator. No changes applied.",
      );
    }
    const extraAdmins = users.rows.filter(
      (r) => r.is_admin && r.id !== retained.id,
    );
    if (extraAdmins.length) {
      console.table(
        extraAdmins.map((r) => ({
          email: r.email,
          issue: "ANOTHER ACTIVE ADMIN — manual review required",
        })),
      );
      throw new Error(
        "Another administrator exists. Refusing automated change.",
      );
    }
    const targets = users.rows.filter(
      (r) => r.id !== retained.id && !r.is_admin,
    );
    console.log(
      `Account preview. KEEP: ${retained.email} | Candidate accounts: ${targets.length}`,
    );
    console.table(
      targets.map((r) => ({
        email: r.email,
        access_status: r.access_status,
        action: execute ? "DISABLE" : "PREVIEW",
      })),
    );
    if (!execute) {
      console.log(
        "DRY RUN ONLY: use --execute=DISABLE_NON_ADMIN_USERS after reviewing the list.",
      );
      await client.query("ROLLBACK");
    } else {
      const ids = targets.map((r) => r.id);
      if (ids.length) {
        const disabled = await client.query(
          `
          UPDATE user_access SET status='disabled', disabled_at=COALESCE(disabled_at, now()), updated_at=now()
          WHERE user_id = ANY($1::text[]) AND status <> 'disabled' RETURNING user_id
        `,
          [ids],
        );
        const revoked = await client.query(
          `
          UPDATE role_grants SET revoked_at=now(), revoked_by_id=$2
          WHERE user_id=ANY($1::text[]) AND revoked_at IS NULL RETURNING id
        `,
          [ids, retained.id],
        );
        const sessions = await client.query(
          `DELETE FROM "session" WHERE user_id=ANY($1::text[]) RETURNING id`,
          [ids],
        );
        console.log({
          disabled: disabled.rowCount,
          roleGrantsRevoked: revoked.rowCount,
          sessionsRevoked: sessions.rowCount,
        });
      }
      await client.query("COMMIT");
      console.log(
        "SOFT DISABLE COMPLETE. User rows and all historical workflow references were kept.",
      );
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error(
    "Account operation failed:",
    error instanceof Error ? error.message : "unknown",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
