import { randomUUID } from "node:crypto";
import { createDeviceToken, isDeviceToken } from "./device-security";

/** WC-017 Slice 02: security policy. Repository persistence remains a separate adapter. */
export type DeviceStatus = "active" | "revoked";
export type DeviceRecord = {
  id: string;
  organizationId: string;
  sourceId: string;
  status: DeviceStatus;
  credentialVersion: number;
  credentialHash: string;
  createdAt: Date;
  revokedAt: Date | null;
};
export type DeviceCredential = {
  deviceId: string;
  token: string;
  version: number;
};
export type CredentialHasher = {
  hash(token: string): string;
  verify(token: string, encoded: string): boolean;
};
export type LifecycleStore = {
  create(record: DeviceRecord): Promise<void>;
  find(deviceId: string): Promise<DeviceRecord | null>;
  /** Must execute compare-and-swap atomically to prevent concurrent rotations/revocations. */
  updateIfVersion(
    deviceId: string,
    expectedVersion: number,
    next: DeviceRecord,
  ): Promise<boolean>;
};
export type ScopedActor = { organizationId: string; manageDevices: true };
export class DeviceLifecycleError extends Error {
  constructor(
    public readonly code:
      | "INVALID_DEVICE"
      | "DEVICE_NOT_FOUND"
      | "DEVICE_REVOKED"
      | "DEVICE_SCOPE_DENIED"
      | "STALE_DEVICE_VERSION"
      | "INVALID_CREDENTIAL",
    public readonly status: 400 | 401 | 403 | 404 | 409,
  ) {
    super(code);
  }
}
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function checkUuid(value: string): void {
  if (!UUID.test(value)) throw new DeviceLifecycleError("INVALID_DEVICE", 400);
}
export function createDeviceLifecycle(
  store: LifecycleStore,
  hasher: CredentialHasher,
) {
  return {
    async provision(
      actor: ScopedActor,
      sourceId: string,
    ): Promise<DeviceCredential> {
      checkUuid(actor.organizationId);
      checkUuid(sourceId);
      const deviceId = randomUUID();
      const secret = createDeviceToken();
      await store.create({
        id: deviceId,
        organizationId: actor.organizationId,
        sourceId,
        status: "active",
        credentialVersion: 1,
        credentialHash: hasher.hash(secret),
        createdAt: new Date(),
        revokedAt: null,
      });
      return { deviceId, token: secret, version: 1 };
    },

    async authenticate(
      deviceId: string,
      secret: string,
    ): Promise<{ deviceId: string; organizationId: string; sourceId: string }> {
      checkUuid(deviceId);

      if (!isDeviceToken(secret)) {
        throw new DeviceLifecycleError("INVALID_CREDENTIAL", 401);
      }

      const row = await store.find(deviceId);

      if (row?.status !== "active") {
        throw new DeviceLifecycleError("INVALID_CREDENTIAL", 401);
      }

      if (!hasher.verify(secret, row.credentialHash)) {
        throw new DeviceLifecycleError("INVALID_CREDENTIAL", 401);
      }

      return {
        deviceId: row.id,
        organizationId: row.organizationId,
        sourceId: row.sourceId,
      };
    },

    async rotate(
      actor: ScopedActor,
      deviceId: string,
    ): Promise<DeviceCredential> {
      checkUuid(deviceId);
      const row = await store.find(deviceId);
      if (!row) throw new DeviceLifecycleError("DEVICE_NOT_FOUND", 404);
      if (row.organizationId !== actor.organizationId)
        throw new DeviceLifecycleError("DEVICE_SCOPE_DENIED", 403);
      if (row.status !== "active")
        throw new DeviceLifecycleError("DEVICE_REVOKED", 409);
      const secret = createDeviceToken();
      const version = row.credentialVersion + 1;
      if (
        !(await store.updateIfVersion(deviceId, row.credentialVersion, {
          ...row,
          credentialVersion: version,
          credentialHash: hasher.hash(secret),
        }))
      )
        throw new DeviceLifecycleError("STALE_DEVICE_VERSION", 409);
      return { deviceId, token: secret, version };
    },
    async revoke(actor: ScopedActor, deviceId: string): Promise<void> {
      checkUuid(deviceId);
      const row = await store.find(deviceId);
      if (!row) throw new DeviceLifecycleError("DEVICE_NOT_FOUND", 404);
      if (row.organizationId !== actor.organizationId)
        throw new DeviceLifecycleError("DEVICE_SCOPE_DENIED", 403);
      if (row.status === "revoked") return;
      if (
        !(await store.updateIfVersion(deviceId, row.credentialVersion, {
          ...row,
          status: "revoked",
          credentialVersion: row.credentialVersion + 1,
          revokedAt: new Date(),
        }))
      )
        throw new DeviceLifecycleError("STALE_DEVICE_VERSION", 409);
    },
  };
}
