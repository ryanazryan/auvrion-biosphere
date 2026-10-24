/**
 * AB-WC-017 Slice 02B: PostgreSQL store for the already-tested lifecycle API.
 * IMPORTANT: A request-scoped actorUserId is required on all mutations.
 * Never pass an unverified client-supplied actor; obtain it from checkAdminAccess.
 * Do not log token or credentialHash. Database writes and audit events are atomic.
 */
import type { Pool, PoolClient } from "pg";
import {
  createDeviceLifecycle,
  type DeviceRecord,
  type LifecycleStore,
} from "./device-lifecycle";
import { hashDeviceToken, verifyDeviceToken } from "./device-security";

export class DevicePersistenceError extends Error {
  constructor(
    public readonly code:
      | "DEVICE_ACTOR_REQUIRED"
      | "DEVICE_ACTOR_SCOPE_DENIED"
      | "ACTIVE_LISTEN_SOURCE_REQUIRED"
      | "SOURCE_ALREADY_PROVISIONED"
      | "INVALID_DEVICE_TRANSITION"
      | "DEVICE_PERSISTENCE_FAILED",
  ) {
    super(code);
  }
}

type PersistedDevice = {
  id: string;
  organization_id: string;
  source_id: string;
  status: "active" | "revoked";
  credential_version: number;
  credential_hash: string;
  created_at: Date;
  revoked_at: Date | null;
};

function toRecord(row: PersistedDevice): DeviceRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    sourceId: row.source_id,
    status: row.status,
    credentialVersion: row.credential_version,
    credentialHash: row.credential_hash,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

async function inTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      const value = await operation(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
}

/** Refuse arbitrary writes from a request without a verified human actor. */
function requiredActor(
  userId: string | undefined,
  actorOrganizationId: string | undefined,
  organizationId: string,
): string {
  if (!userId || userId.trim() !== userId || userId.length > 256) {
    throw new DevicePersistenceError("DEVICE_ACTOR_REQUIRED");
  }
  if (!actorOrganizationId || actorOrganizationId !== organizationId) {
    throw new DevicePersistenceError("DEVICE_ACTOR_SCOPE_DENIED");
  }
  return userId;
}

/** Immutable IDs, tenant/source binding, one-version increment and strict state transitions. */
function validateTransition(before: DeviceRecord, next: DeviceRecord): void {
  if (
    before.id !== next.id ||
    before.organizationId !== next.organizationId ||
    before.sourceId !== next.sourceId ||
    before.createdAt.getTime() !== next.createdAt.getTime() ||
    before.status !== "active" ||
    !/^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{64}$/.test(next.credentialHash) ||
    next.credentialVersion !== before.credentialVersion + 1 ||
    (next.status !== "active" && next.status !== "revoked") ||
    (next.status === "active" &&
      (next.revokedAt !== null ||
        next.credentialHash === before.credentialHash)) ||
    (next.status === "revoked" &&
      (next.revokedAt === null ||
        next.credentialHash !== before.credentialHash))
  ) {
    throw new DevicePersistenceError("INVALID_DEVICE_TRANSITION");
  }
}

export function createPostgresDeviceStore(input: {
  pool: Pool;
  /** Obtained from verified Better Auth human session with manage_devices + MFA. */
  actorUserId?: string;
  actorOrganizationId?: string;
}): LifecycleStore {
  const { pool, actorUserId, actorOrganizationId } = input;
  return {
    async create(record) {
      const actor = requiredActor(
        actorUserId,
        actorOrganizationId,
        record.organizationId,
      );
      if (
        !/^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{64}$/.test(record.credentialHash) ||
        record.status !== "active" ||
        record.credentialVersion !== 1 ||
        record.revokedAt !== null
      ) {
        throw new DevicePersistenceError("INVALID_DEVICE_TRANSITION");
      }
      await inTransaction(pool, async (client) => {
        const source = await client.query(
          `SELECT id FROM observation_sources
             WHERE id = $1 AND organization_id = $2
               AND kind = 'listen_device' AND is_active = true
             FOR SHARE`,
          [record.sourceId, record.organizationId],
        );
        if (source.rowCount !== 1) {
          throw new DevicePersistenceError("ACTIVE_LISTEN_SOURCE_REQUIRED");
        }
        try {
          await client.query(
            `INSERT INTO ingestion_devices
              (id, organization_id, source_id, status, credential_version,
               credential_hash, created_at, created_by_user_id)
             VALUES ($1, $2, $3, 'active', 1, $4, $5, $6)`,
            [
              record.id,
              record.organizationId,
              record.sourceId,
              record.credentialHash,
              record.createdAt,
              actor,
            ],
          );
        } catch (error) {
          if (
            (error as { code?: string; constraint?: string }).code ===
              "23505" &&
            (error as { constraint?: string }).constraint ===
              "ingestion_devices_source_uq"
          ) {
            throw new DevicePersistenceError("SOURCE_ALREADY_PROVISIONED");
          }
          throw error;
        }
        await client.query(
          `INSERT INTO ingestion_device_credentials
             (device_id, organization_id, generation, credential_hash, created_by_user_id)
           VALUES ($1, $2, 1, $3, $4)`,
          [record.id, record.organizationId, record.credentialHash, actor],
        );
        await client.query(
          `INSERT INTO ingestion_device_events
             (device_id, organization_id, event_type, from_version,
              to_version, actor_user_id)
           VALUES ($1, $2, 'provisioned', NULL, 1, $3)`,
          [record.id, record.organizationId, actor],
        );
      });
    },
    async find(deviceId) {
      const result = await pool.query<PersistedDevice>(
        `SELECT d.id, d.organization_id, d.source_id, d.status,
                d.credential_version, d.credential_hash, d.created_at, d.revoked_at
           FROM ingestion_devices AS d
           JOIN observation_sources AS s
             ON s.id = d.source_id AND s.organization_id = d.organization_id
          WHERE d.id = $1 AND s.kind = 'listen_device' AND s.is_active = true`,
        [deviceId],
      );
      const row = result.rows[0];
      return row ? toRecord(row) : null;
    },
    async updateIfVersion(deviceId, expectedVersion, next) {
      return inTransaction(pool, async (client) => {
        const current = await client.query<PersistedDevice>(
          `SELECT d.id, d.organization_id, d.source_id, d.status,
                  d.credential_version, d.credential_hash, d.created_at, d.revoked_at
             FROM ingestion_devices AS d
             JOIN observation_sources AS s
               ON s.id = d.source_id AND s.organization_id = d.organization_id
            WHERE d.id = $1 AND s.kind = 'listen_device' AND s.is_active = true
            FOR UPDATE OF d`,
          [deviceId],
        );
        const row = current.rows[0];
        if (!row || row.credential_version !== expectedVersion) return false;
        const before = toRecord(row);
        const actor = requiredActor(
          actorUserId,
          actorOrganizationId,
          before.organizationId,
        );
        validateTransition(before, next);
        const isRotation = next.status === "active";
        const updated = await client.query(
          `UPDATE ingestion_devices
              SET credential_version = $3, credential_hash = $4,
                  status = $5, revoked_at = $6,
                  revoked_by_user_id = CASE WHEN $5 = 'revoked' THEN $7 ELSE NULL END
            WHERE id = $1 AND credential_version = $2 AND status = 'active'`,
          [
            deviceId,
            expectedVersion,
            next.credentialVersion,
            next.credentialHash,
            next.status,
            next.revokedAt,
            actor,
          ],
        );
        if (updated.rowCount !== 1) return false;
        const retired = await client.query(
          `UPDATE ingestion_device_credentials
              SET retired_at = now(), retired_by_user_id = $3
            WHERE device_id = $1 AND generation = $2 AND retired_at IS NULL`,
          [deviceId, expectedVersion, actor],
        );
        if (retired.rowCount !== 1) {
          throw new DevicePersistenceError("DEVICE_PERSISTENCE_FAILED");
        }
        if (isRotation) {
          await client.query(
            `INSERT INTO ingestion_device_credentials
               (device_id, organization_id, generation, credential_hash, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              deviceId,
              before.organizationId,
              next.credentialVersion,
              next.credentialHash,
              actor,
            ],
          );
        }
        await client.query(
          `INSERT INTO ingestion_device_events
             (device_id, organization_id, event_type, from_version,
              to_version, actor_user_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            deviceId,
            before.organizationId,
            isRotation ? "credential_rotated" : "device_revoked",
            expectedVersion,
            next.credentialVersion,
            actor,
          ],
        );
        return true;
      });
    },
  };
}

/**
 * This wiring uses the same scrypt KDF/token encoding as Slice 01.
 * Authentication reads current credential hash; no old generation is accepted.
 */
export function createPostgresDeviceLifecycle(input: {
  pool: Pool;
  actorUserId?: string;
  actorOrganizationId?: string;
}) {
  return createDeviceLifecycle(createPostgresDeviceStore(input), {
    hash: hashDeviceToken,
    verify: verifyDeviceToken,
  });
}
