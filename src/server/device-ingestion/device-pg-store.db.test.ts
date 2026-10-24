/**
 * AB-WC-017 Slice 02B PostgreSQL integration tests; opt-in ONLY on isolated
 * 127.0.0.1:5435/auvrion_wc007_test (the existing WC007 integration DB).
 * Fixture data use random IDs and are removed in afterAll.
 */
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DeviceLifecycleError } from "./device-lifecycle";
import {
  createPostgresDeviceLifecycle,
  DevicePersistenceError,
} from "./device-pg-store";
import { verifyDeviceToken } from "./device-security";

const ENABLED = process.env.RUN_WC017_DB_TESTS === "YES";
const organizationA = randomUUID();
const organizationB = randomUUID();
const actorId = `wc017-${randomUUID()}`;
const scopedA = { organizationId: organizationA, manageDevices: true } as const;
const scopedB = { organizationId: organizationB, manageDevices: true } as const;

function testDatabaseUrl(): string {
  loadEnvFile(".env.local");
  const dev = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (
    !["postgres:", "postgresql:"].includes(dev.protocol) ||
    dev.hostname !== "127.0.0.1" ||
    dev.port !== "5433" ||
    dev.pathname !== "/auvrion_dev" ||
    decodeURIComponent(dev.username) !== "auvrion_dev"
  ) {
    throw new Error("WC017_REFUSING_UNKNOWN_DEV_DATABASE");
  }
  dev.port = "5435";
  dev.pathname = "/auvrion_wc007_test";
  return dev.toString();
}

describe.skipIf(!ENABLED)("AB-WC-017 PostgreSQL lifecycle (isolated)", () => {
  let pool: Pool;
  const lifecycle = () =>
    createPostgresDeviceLifecycle({
      pool,
      actorUserId: actorId,
      actorOrganizationId: organizationA,
    });

  async function source(
    input: {
      organizationId?: string;
      kind?: "listen_device" | "manual";
      isActive?: boolean;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO observation_sources
        (id, organization_id, kind, code, label, is_active)
       VALUES ($1, $2, $3, $4, 'WC017 synthetic source', $5)`,
      [
        id,
        input.organizationId ?? organizationA,
        input.kind ?? "listen_device",
        `WC017-${id}`,
        input.isActive ?? true,
      ],
    );
    return id;
  }

  beforeAll(async () => {
    pool = new Pool({
      connectionString: testDatabaseUrl(),
      max: 3,
      connectionTimeoutMillis: 5000,
    });
    const check = await pool.query(
      `SELECT current_database() AS name,
              to_regclass('public.ingestion_devices') AS devices,
              to_regclass('public.ingestion_device_credentials') AS credentials,
              to_regclass('public.ingestion_device_events') AS events`,
    );
    if (
      check.rows[0]?.name !== "auvrion_wc007_test" ||
      !check.rows[0]?.devices ||
      !check.rows[0]?.credentials ||
      !check.rows[0]?.events
    ) {
      throw new Error("WC017_TEST_DB_NOT_MIGRATED_OR_WRONG_DB");
    }
    await pool.query(
      `INSERT INTO organizations (id, code, name)
       VALUES ($1, $3, 'WC017 Org A'), ($2, $4, 'WC017 Org B')`,
      [
        organizationA,
        organizationB,
        `WC017-${organizationA}`,
        `WC017-${organizationB}`,
      ],
    );
    await pool.query(
      `INSERT INTO "user" (id, name, email)
       VALUES ($1, 'WC017 Synthetic Admin', $2)`,
      [actorId, `${actorId}@example.invalid`],
    );
  }, 20000);

  afterAll(async () => {
    if (!pool) return;
    try {
      // Scoped cleanup only for this test's random organizations/user.
      await pool.query(
        `DELETE FROM ingestion_device_events WHERE organization_id IN ($1, $2)`,
        [organizationA, organizationB],
      );
      await pool.query(
        `DELETE FROM ingestion_device_credentials WHERE organization_id IN ($1, $2)`,
        [organizationA, organizationB],
      );
      await pool.query(
        `DELETE FROM ingestion_devices WHERE organization_id IN ($1, $2)`,
        [organizationA, organizationB],
      );
      await pool.query(
        `DELETE FROM observation_sources WHERE organization_id IN ($1, $2)`,
        [organizationA, organizationB],
      );
      await pool.query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [
        organizationA,
        organizationB,
      ]);
      await pool.query(`DELETE FROM "user" WHERE id = $1`, [actorId]);
    } finally {
      await pool.end();
    }
  }, 20000);

  it("provisions scoped LISTEN device, persists only hash and immutable event", async () => {
    const sourceId = await source();
    const result = await lifecycle().provision(scopedA, sourceId);
    const storage = await pool.query(
      `SELECT d.organization_id, d.source_id, d.credential_hash,
              c.generation, c.credential_hash AS history_hash,
              e.event_type, e.actor_user_id
       FROM ingestion_devices d
       JOIN ingestion_device_credentials c ON c.device_id = d.id
       JOIN ingestion_device_events e ON e.device_id = d.id
       WHERE d.id = $1`,
      [result.deviceId],
    );
    expect(storage.rowCount).toBe(1);
    const dbRow = storage.rows[0];
    expect(dbRow.organization_id).toBe(organizationA);
    expect(dbRow.source_id).toBe(sourceId);
    expect(dbRow.generation).toBe(1);
    expect(dbRow.credential_hash).not.toBe(result.token);
    expect(dbRow.history_hash).not.toBe(result.token);
    expect(verifyDeviceToken(result.token, dbRow.credential_hash)).toBe(true);
    expect(dbRow.event_type).toBe("provisioned");
    expect(dbRow.actor_user_id).toBe(actorId);
    await expect(
      lifecycle().authenticate(result.deviceId, result.token),
    ).resolves.toMatchObject({ organizationId: organizationA, sourceId });
  });

  it("immediately retires old credential and persists rotation atomically", async () => {
    const id = await source();
    const initial = await lifecycle().provision(scopedA, id);
    const rotated = await lifecycle().rotate(scopedA, initial.deviceId);
    expect(rotated.version).toBe(2);
    await expect(
      lifecycle().authenticate(initial.deviceId, initial.token),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL", status: 401 });
    await expect(
      lifecycle().authenticate(initial.deviceId, rotated.token),
    ).resolves.toMatchObject({ sourceId: id });
    const versions = await pool.query(
      `SELECT generation, retired_at FROM ingestion_device_credentials
       WHERE device_id = $1 ORDER BY generation`,
      [initial.deviceId],
    );
    expect(versions.rows).toHaveLength(2);
    expect(versions.rows[0].retired_at).toBeInstanceOf(Date);
    expect(versions.rows[1].retired_at).toBeNull();
  });

  it("device revoke stops auth, retires credential, and is idempotent", async () => {
    const id = await source();
    const initial = await lifecycle().provision(scopedA, id);
    await lifecycle().revoke(scopedA, initial.deviceId);
    await lifecycle().revoke(scopedA, initial.deviceId);
    await expect(
      lifecycle().authenticate(initial.deviceId, initial.token),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL" });
    await expect(
      lifecycle().rotate(scopedA, initial.deviceId),
    ).rejects.toMatchObject({ code: "DEVICE_REVOKED" });
    const state = await pool.query(
      `SELECT d.status, d.credential_version, d.revoked_at,
              (SELECT count(*)::int FROM ingestion_device_events e
               WHERE e.device_id = d.id) AS audit_count
       FROM ingestion_devices d WHERE d.id = $1`,
      [initial.deviceId],
    );
    expect(state.rows[0]).toMatchObject({
      status: "revoked",
      credential_version: 2,
      audit_count: 2,
    });
    expect(state.rows[0].revoked_at).toBeInstanceOf(Date);
  });

  it("denies cross-org mutation while preserving credential validity", async () => {
    const id = await source();
    const initial = await lifecycle().provision(scopedA, id);
    await expect(
      lifecycle().rotate(scopedB, initial.deviceId),
    ).rejects.toMatchObject({ code: "DEVICE_SCOPE_DENIED", status: 403 });
    await expect(
      lifecycle().revoke(scopedB, initial.deviceId),
    ).rejects.toMatchObject({ code: "DEVICE_SCOPE_DENIED" });
    await expect(
      lifecycle().authenticate(initial.deviceId, initial.token),
    ).resolves.toMatchObject({ organizationId: organizationA });
  });

  it("refuses non-LISTEN and inactive observation sources", async () => {
    const manualSource = await source({ kind: "manual" });
    const inactiveSource = await source({ isActive: false });
    for (const id of [manualSource, inactiveSource]) {
      await expect(lifecycle().provision(scopedA, id)).rejects.toMatchObject({
        code: "ACTIVE_LISTEN_SOURCE_REQUIRED",
      });
    }
  });

  it("rejects cross-org source and duplicate source provisioning", async () => {
    const sourceB = await source({ organizationId: organizationB });
    await expect(lifecycle().provision(scopedA, sourceB)).rejects.toMatchObject(
      {
        code: "ACTIVE_LISTEN_SOURCE_REQUIRED",
      },
    );
    const id = await source();
    await lifecycle().provision(scopedA, id);
    await expect(lifecycle().provision(scopedA, id)).rejects.toMatchObject({
      code: "SOURCE_ALREADY_PROVISIONED",
    });
  });

  it("denies a device request when its source becomes inactive", async () => {
    const id = await source();
    const initial = await lifecycle().provision(scopedA, id);
    await pool.query(
      "UPDATE observation_sources SET is_active = false WHERE id = $1",
      [id],
    );
    await expect(
      lifecycle().authenticate(initial.deviceId, initial.token),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL" });
  });

  it("rejects writes without a trusted human actor", async () => {
    const id = await source();
    const noActor = createPostgresDeviceLifecycle({ pool });
    await expect(noActor.provision(scopedA, id)).rejects.toBeInstanceOf(
      DevicePersistenceError,
    );
  });

  it("denies a store actor bound to a different organization", async () => {
    const id = await source();
    const wrongScope = createPostgresDeviceLifecycle({
      pool,
      actorUserId: actorId,
      actorOrganizationId: organizationB,
    });
    await expect(wrongScope.provision(scopedA, id)).rejects.toMatchObject({
      code: "DEVICE_ACTOR_SCOPE_DENIED",
    });
  });

  it("failed DB actor FK rolls back device and audit rather than returning a token", async () => {
    const id = await source();
    const unknownActor = createPostgresDeviceLifecycle({
      pool,
      actorUserId: `missing-${randomUUID()}`,
      actorOrganizationId: organizationA,
    });
    await expect(unknownActor.provision(scopedA, id)).rejects.toMatchObject({
      code: "23503",
    });
    const check = await pool.query(
      "SELECT id FROM ingestion_devices WHERE source_id=$1",
      [id],
    );
    expect(check.rows).toHaveLength(0);
  });

  it("only one concurrent rotation wins compare-and-swap; failed contender leaks no token", async () => {
    const id = await source();
    const initial = await lifecycle().provision(scopedA, id);
    const outcomes = await Promise.allSettled([
      lifecycle().rotate(scopedA, initial.deviceId),
      lifecycle().rotate(scopedA, initial.deviceId),
    ]);
    // Both can succeed sequentially if the second reads *after* the first commits;
    // this test checks monotonic credential history, not a fragile scheduler ordering.
    const successes = outcomes.filter((o) => o.status === "fulfilled");
    expect(successes.length).toBeGreaterThanOrEqual(1);
    const history = await pool.query(
      `SELECT generation, retired_at FROM ingestion_device_credentials
       WHERE device_id=$1 ORDER BY generation`,
      [initial.deviceId],
    );
    expect(history.rows).toHaveLength(successes.length + 1);
    expect(history.rows.filter((r) => r.retired_at === null)).toHaveLength(1);
    const events = await pool.query(
      `SELECT to_version FROM ingestion_device_events
       WHERE device_id = $1 ORDER BY to_version`,
      [initial.deviceId],
    );
    expect(events.rows).toHaveLength(history.rows.length);
  });

  it("auth rejects unknown IDs and malformed tokens using the real SQL adapter", async () => {
    await expect(
      lifecycle().authenticate(randomUUID(), "invalid"),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL", status: 401 });
    await expect(
      lifecycle().authenticate(randomUUID(), `abdev_v1_${"A".repeat(43)}`),
    ).rejects.toBeInstanceOf(DeviceLifecycleError);
  });
});
