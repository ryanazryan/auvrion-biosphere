/** Safe, read-only readiness signals. Run inside production app container. */
import pg from "pg";

const env = process.env;
const variables = [
  "ENABLE_PRODUCTION_ONBOARDING",
  "AUVRION_BETA_ALLOWED_EMAILS",
  "BETTER_AUTH_URL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "OPENAI_API_KEY",
  "AUVRION_FIRMS_MAP_KEY",
  "AUVRION_BMKG_ADM4",
  "AUVRION_EXTERNAL_ORGANIZATION_ID",
  "AUVRION_EXTERNAL_REGION_LABEL",
  "AUVRION_FIRMS_BBOX",
  "AUVRION_PERCH_WORKER_TOKEN",
  "PRIVATE_EVIDENCE_DIR",
];
console.log("=== CONFIGURATION (names and readiness only) ===");
for (const name of variables) {
  const val = env[name] ?? "";
  console.log(`${name}: ${val ? "SET" : "MISSING"}`);
}
let failures = 0;
if (
  env.ENABLE_PRODUCTION_ONBOARDING !== "YES" ||
  !env.AUVRION_BETA_ALLOWED_EMAILS
) {
  console.log("CLOSED_BETA: NOT READY â€” explicit tester allowlist required");
  failures++;
}
try {
  const db = new pg.Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 4000,
  });
  await db.connect();
  try {
    const counts = await db.query(`
      SELECT
        (SELECT count(*)::int FROM observation_sources WHERE kind = 'listen_device') AS listen_sources,
        (SELECT count(*)::int FROM ingestion_devices) AS provisioned_devices,
        (SELECT count(*)::int FROM ingestion_recordings) AS recordings,
        to_regclass('public.listen_device_installations') IS NOT NULL AS installation_table,
        to_regclass('public.access_email_verification_tokens') IS NOT NULL AS verification_table,
        to_regclass('public.access_status_recovery') IS NOT NULL AS status_recovery_table,
        (SELECT count(*)::int FROM organizations WHERE code='AUVRION-LOCAL') AS local_organizations
    `);
    console.log("DATABASE INVENTORY:", JSON.stringify(counts.rows[0]));
  } finally {
    await db.end();
  }
} catch (err) {
  console.log("DATABASE CHECK FAILED:", err.code ?? err.name ?? "unknown");
  failures++;
}
try {
  const net = await import("node:net");
  const port = Number(env.AUVRION_PERCH_WORKER_PORT ?? 8765);
  const connected = await new Promise((resolve) => {
    const sock = net.createConnection({ host: "127.0.0.1", port });
    sock.setTimeout(3000);
    sock.on("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.on("timeout", () => {
      sock.destroy();
      resolve(false);
    });
  });
  console.log(
    "PERCH TCP:",
    connected ? "REACHABLE (model NOT validated)" : "OFFLINE",
  );
} catch {
  console.log("PERCH TCP: CHECK FAILED");
}
console.log("READINESS:", failures ? "NEEDS_WORK" : "BASELINE_OK");
process.exitCode = failures ? 1 : 0;
