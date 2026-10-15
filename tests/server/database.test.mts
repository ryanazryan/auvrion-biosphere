import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { getDatabaseUrl } from "../../src/server/db/config.mts";
import { closeDatabase } from "../../src/server/db/index.mts";

test("database configuration rejects missing, malformed and nonlocal targets safely", () => {
  for (const value of [
    undefined,
    "",
    "REDACTION_SENTINEL",
    "https://local-test:REDACTION_SENTINEL@127.0.0.1/test",
    "postgresql://local-test:REDACTION_SENTINEL@db.invalid/test",
    "postgresql://local-test:REDACTION_SENTINEL@127.0.0.1/test?host=db.invalid",
    "postgresql://local-test:REDACTION_SENTINEL@127.0.0.1/",
  ]) {
    assert.throws(
      () => getDatabaseUrl({ DATABASE_URL: value }),
      (error: unknown) => error instanceof Error &&
        error.message.startsWith("Database configuration is missing or invalid.") &&
        !error.message.includes("REDACTION_SENTINEL"),
    );
  }
});

test("local URLs support explicit TCP ports and IPv6 loopback", () => {
  for (const host of ["127.0.0.1:5432", "localhost:5433", "[::1]:5432"]) {
    const value = `postgresql://local-test@${host}/local_test`;
    assert.equal(getDatabaseUrl({ DATABASE_URL: value }), value);
  }
});

test("import and shutdown need no database configuration or live connection", async () => {
  await closeDatabase();
});

test("database module blocks imports without the server-only condition", () => {
  const result = spawnSync(process.execPath, [
    "--input-type=module", "-e",
    "import('./src/server/db/index.mts').catch(error => { if (error.message.includes('cannot be imported from a Client Component')) process.exit(23); process.exit(24); });",
  ], { encoding: "utf8", timeout: 10_000 });

  assert.equal(result.status, 23);
});

test("database CLI fails without configuration and reveals no diagnostic details", () => {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "scripts/check-db.mts",
  ], {
    env: { ...process.env, DATABASE_URL: "" },
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(),
    "Database check failed. Verify local DATABASE_URL, server availability and access. Connection details are not logged.");
});

test("driver connection failures are redacted and the CLI terminates", async () => {
  // Reserve then release an ephemeral loopback port; no database is involved.
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });

  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "scripts/check-db.mts",
  ], {
    env: {
      ...process.env,
      DATABASE_URL: `postgresql://local-test:REDACTION_SENTINEL@127.0.0.1:${address.port}/local_test`,
    },
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(),
    "Database check failed. Verify local DATABASE_URL, server availability and access. Connection details are not logged.");
});
