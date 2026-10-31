/**
 * Private production CLI for an initial, owner-authorized demo roster.
 * NEVER expose this as a web route or run without owner approval.
 *
 * node scripts/production/invite-demo-accounts.mjs /run/demo-accounts.json
 * One account per unique, deliverable email. Invitation is one-use and expires
 * after 30 minutes. Password and TOTP are enrolled by each recipient.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { Resend } from "resend";

const DECISION = "PRODUCTION DEMO ADMIN: owner-invited reviewer";
const OPERATIONAL = new Set(["operator", "supervisor", "ranger"]);
const ORIGIN = "https://auvrionbiosphere.com";
const ORG = "AUVRION-LOCAL";
const RETRY_COOLDOWN_MS = 60_000;

function fail(msg) {
  throw new Error(msg);
}
function normalizedEmail(value) {
  if (typeof value !== "string") fail("Invalid email");
  const e = value.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e))
    fail("Invalid email");
  return e;
}

async function main() {
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_PRODUCTION_DEMO_INVITES !== "YES"
  ) {
    fail("Explicit private production invitation authorization is required");
  }
  if (
    process.env.BETTER_AUTH_URL !== ORIGIN ||
    process.env.RESEND_FROM_EMAIL !== "no-reply@auvrionbiosphere.com" ||
    !process.env.RESEND_API_KEY
  )
    fail("Verified production email configuration required");

  const ownerEmail = normalizedEmail(process.env.PRODUCTION_ADMIN_EMAIL);
  if (ownerEmail === "dev-admin@example.test")
    fail("Development owner not allowed");

  const dbURL = process.env.DATABASE_URL;
  if (!dbURL) fail("DATABASE_URL required");
  const target = new URL(dbURL);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.hostname !== "database" ||
    (target.port && target.port !== "5432") ||
    !target.pathname ||
    target.pathname === "/" ||
    target.pathname === "/auvrion_dev"
  )
    fail("Unexpected database target");

  const manifestPath = process.argv[2];
  if (!manifestPath?.startsWith("/run/")) {
    fail("Pass an absolute private manifest path under /run/");
  }
  const entries = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 12) {
    fail("Manifest must contain 1..12 demo accounts");
  }
  const emails = new Set();
  const roster = entries.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !["admin", ...OPERATIONAL].includes(entry.role) ||
      typeof entry.name !== "string" ||
      entry.name.trim().length < 2 ||
      entry.name.length > 200
    )
      fail("Invalid manifest entry");
    const email = normalizedEmail(entry.email);
    if (email === ownerEmail || emails.has(email))
      fail("Owner/duplicate email in manifest");
    emails.add(email);
    return { email, name: entry.name.trim(), role: entry.role };
  });

  const client = new pg.Client({ connectionString: dbURL });
  const resend = new Resend(process.env.RESEND_API_KEY);
  await client.connect();
  let ok = 0;
  let failed = 0;
  try {
    // Only active, TOTP-verified, explicitly granted first owner may authorize.
    const owner = await client.query(
      `
      SELECT u.id, o.id AS organization_id
      FROM "user" u
      JOIN user_access ua ON ua.user_id = u.id AND ua.status = 'active'
      JOIN organizations o ON o.code = $2
      WHERE lower(u.email) = $1 AND u.email_verified = true AND u.two_factor_enabled = true
        AND EXISTS (SELECT 1 FROM two_factor tf WHERE tf.user_id = u.id AND tf.verified = true)
        AND EXISTS (SELECT 1 FROM admin_capability_grants g
          WHERE g.user_id = u.id AND g.organization_id = o.id
            AND g.capability = 'review_applications' AND g.revoked_at IS NULL)
        AND EXISTS (SELECT 1 FROM admin_capability_grants g
          WHERE g.user_id = u.id AND g.organization_id = o.id
            AND g.capability = 'manage_access' AND g.revoked_at IS NULL)
    `,
      [ownerEmail, ORG],
    );
    if (owner.rowCount !== 1)
      fail("Verified active owner is required before demo invitations");
    const ownerId = owner.rows[0].id;
    const orgId = owner.rows[0].organization_id;

    for (const record of roster) {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 60_000);
      let tx = false;
      try {
        await client.query("BEGIN");
        tx = true;
        // Rechecking per-account guards under a transaction-level lock.
        await client.query("SELECT pg_advisory_xact_lock(2026, 3102)");
        const existing = await client.query(
          `
          SELECT u.id, ua.status, aa.decision_reason, i.id AS invite_id,
                 i.issued_at, i.used_at,
                 (SELECT rg.role FROM role_grants rg WHERE rg.user_id = u.id
                    AND rg.revoked_at IS NULL LIMIT 1) AS operational_role,
                 EXISTS(SELECT 1 FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential') AS has_credential
          FROM "user" u
          LEFT JOIN user_access ua ON ua.user_id = u.id
          LEFT JOIN access_applications aa ON aa.id = ua.application_id
          LEFT JOIN account_activation_invites i ON i.user_id = u.id
          WHERE lower(u.email) = $1
          FOR UPDATE OF u
        `,
          [record.email],
        );
        if (existing.rowCount > 0) {
          const old = existing.rows[0];
          if (
            old.status !== "pending_activation" ||
            !old.invite_id ||
            old.used_at ||
            old.has_credential ||
            (record.role === "admin" && old.decision_reason !== DECISION) ||
            (record.role !== "admin" &&
              (old.decision_reason === DECISION ||
                old.operational_role !== record.role))
          ) {
            fail("Existing identity is not eligible for invitation retry");
          }
          if (
            now.getTime() - new Date(old.issued_at).getTime() <
            RETRY_COOLDOWN_MS
          ) {
            fail("Invitation cooldown not elapsed");
          }
          await client.query(
            `
            UPDATE account_activation_invites SET token_hash = $1, expires_at = $2,
              issued_at = $3, issued_by_id = $4, sent_at = NULL, updated_at = NOW()
            WHERE id = $5 AND used_at IS NULL
          `,
            [tokenHash, expiresAt, now, ownerId, old.invite_id],
          );
        } else {
          const userId = randomUUID();
          const applicationId = randomUUID();
          await client.query(
            `
            INSERT INTO "user" (id, name, email, email_verified, two_factor_enabled)
            VALUES ($1, $2, $3, true, false)
          `,
            [userId, record.name, record.email],
          );
          // The recipient proves email possession by consuming its one-use inbox invite.
          // No password or active app access exists before that proof.
          await client.query(
            `
            INSERT INTO access_applications
              (id, applicant_name, email, status, email_verified_at, reviewed_by_id,
               reviewed_at, decision_reason)
            VALUES ($1, $2, $3, 'approved', NOW(), $4, NOW(), $5)
          `,
            [
              applicationId,
              record.name,
              record.email,
              ownerId,
              record.role === "admin"
                ? DECISION
                : "PRIVATE OWNER-APPROVED DEMO INVITATION",
            ],
          );
          await client.query(
            `
            INSERT INTO user_access (user_id, application_id, status)
            VALUES ($1, $2, 'pending_activation')
          `,
            [userId, applicationId],
          );
          if (record.role === "admin") {
            for (const capability of ["review_applications", "manage_access"]) {
              await client.query(
                `
                INSERT INTO admin_capability_grants (user_id, organization_id, capability, granted_by_id)
                VALUES ($1, $2, $3::admin_capability, $4)
              `,
                [userId, orgId, capability, ownerId],
              );
            }
          } else {
            await client.query(
              `
              INSERT INTO role_grants (user_id, organization_id, role, granted_by_id)
              VALUES ($1, $2, $3::operational_role, $4)
            `,
              [userId, orgId, record.role, ownerId],
            );
          }
          await client.query(
            `
            INSERT INTO account_activation_invites
              (application_id, user_id, issued_by_id, token_hash, expires_at, issued_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
            [applicationId, userId, ownerId, tokenHash, expiresAt, now],
          );
        }
        await client.query("COMMIT");
        tx = false;
      } catch (error) {
        if (tx) await client.query("ROLLBACK").catch(() => undefined);
        failed++;
        // No tokens, identities or email addresses in console output.
        console.error(
          "Invitation preparation rejected:",
          error instanceof Error ? error.message : "unknown",
        );
        continue;
      }

      const link = new URL("/activate", ORIGIN);
      link.hash = `token=${token}`;
      try {
        const { data, error } = await resend.emails.send({
          from: "Auvrion Biosphere <no-reply@auvrionbiosphere.com>",
          to: [record.email],
          subject: "Undangan akun demo Auvrion Biosphere",
          text: `Halo ${record.name},\n\nAnda diundang menguji Auvrion Biosphere sebagai ${record.role}.\nBuka tautan pribadi berikut untuk menetapkan password Anda sendiri:\n${link}\n\nTautan berlaku 30 menit, sekali pakai. Selanjutnya login dan verifikasi Google Authenticator/TOTP. Jangan bagikan tautan atau recovery code.`,
        });
        if (error || !data?.id) fail("Provider did not accept invitation");
        await client.query(
          `
          UPDATE account_activation_invites SET sent_at = NOW(), updated_at = NOW()
          WHERE token_hash = $1 AND used_at IS NULL
        `,
          [tokenHash],
        );
        ok++;
      } catch {
        failed++;
        console.error("Invitation delivery failed; rerun after cooldown");
      }
    }
    console.log(`DEMO_INVITES_SENT=${ok} FAILED=${failed}`);
    if (failed) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    "Demo invitation setup failed:",
    error instanceof Error ? error.message : "unknown",
  );
  process.exitCode = 1;
});
