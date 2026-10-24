import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  type CredentialHasher,
  createDeviceLifecycle,
  type DeviceRecord,
  type LifecycleStore,
  type ScopedActor,
} from "./device-lifecycle";
import {
  createDeviceToken,
  hashDeviceToken,
  isDeviceToken,
  verifyDeviceToken,
} from "./device-security";

/** In-memory compare-and-swap implementation; NOT a PostgreSQL integration test. */
class MemoryLifecycleStore implements LifecycleStore {
  private readonly records = new Map<string, DeviceRecord>();
  updateCount = 0;
  rejectNextUpdate = false;
  rejectNextCreate = false;

  async create(record: DeviceRecord): Promise<void> {
    if (this.rejectNextCreate) {
      this.rejectNextCreate = false;
      throw new Error("SIMULATED_DB_CREATE_FAILURE");
    }
    if (this.records.has(record.id)) throw new Error("DUPLICATE_DEVICE_ID");
    this.records.set(record.id, { ...record });
  }

  async find(deviceId: string): Promise<DeviceRecord | null> {
    const record = this.records.get(deviceId);
    return record ? { ...record } : null;
  }

  async updateIfVersion(
    deviceId: string,
    expectedVersion: number,
    next: DeviceRecord,
  ): Promise<boolean> {
    this.updateCount += 1;
    if (this.rejectNextUpdate) {
      this.rejectNextUpdate = false;
      return false;
    }
    const current = this.records.get(deviceId);
    if (
      !current ||
      current.id !== next.id ||
      current.organizationId !== next.organizationId ||
      current.sourceId !== next.sourceId ||
      current.credentialVersion !== expectedVersion
    ) {
      return false;
    }
    this.records.set(deviceId, { ...next });
    return true;
  }
}

const hasher: CredentialHasher = {
  hash: hashDeviceToken,
  verify: verifyDeviceToken,
};

function actor(organizationId = randomUUID()): ScopedActor {
  return { organizationId, manageDevices: true };
}

function setup() {
  const store = new MemoryLifecycleStore();
  const lifecycle = createDeviceLifecycle(store, hasher);
  const organization = actor();
  const sourceId = randomUUID();
  return { store, lifecycle, organization, sourceId };
}

describe("AB-WC-017 device lifecycle security policy", () => {
  it("provisions an active source-scoped device with a canonical opaque token and only its hash stored", async () => {
    const { store, lifecycle, organization, sourceId } = setup();
    const issued = await lifecycle.provision(organization, sourceId);
    const saved = await store.find(issued.deviceId);

    expect(isDeviceToken(issued.token)).toBe(true);
    expect(issued.version).toBe(1);
    if (!saved) throw new Error("PROVISION_DID_NOT_STORE_DEVICE");
    expect(saved).toMatchObject({
      id: issued.deviceId,
      organizationId: organization.organizationId,
      sourceId,
      status: "active",
      credentialVersion: 1,
      revokedAt: null,
    });
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.credentialHash).not.toBe(issued.token);
    expect(saved.credentialHash.startsWith("scrypt-v1:")).toBe(true);
    expect(verifyDeviceToken(issued.token, saved.credentialHash)).toBe(true);
  });

  it("issues independent device identities and secrets", async () => {
    const { lifecycle, organization, sourceId } = setup();
    const one = await lifecycle.provision(organization, sourceId);
    const two = await lifecycle.provision(organization, sourceId);

    expect(one.deviceId).not.toBe(two.deviceId);
    expect(one.token).not.toBe(two.token);
  });

  it("authenticates a valid device and returns its trusted stored tenant/source scope", async () => {
    const { lifecycle, organization, sourceId } = setup();
    const issued = await lifecycle.provision(organization, sourceId);

    await expect(
      lifecycle.authenticate(issued.deviceId, issued.token),
    ).resolves.toEqual({
      deviceId: issued.deviceId,
      organizationId: organization.organizationId,
      sourceId,
    });
  });

  it("rejects a different but well-formed secret with a generic 401", async () => {
    const { lifecycle, organization, sourceId } = setup();
    const issued = await lifecycle.provision(organization, sourceId);

    await expect(
      lifecycle.authenticate(issued.deviceId, createDeviceToken()),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL", status: 401 });
  });

  it("rejects malformed tokens with a generic 401", async () => {
    const { lifecycle, organization, sourceId } = setup();
    const issued = await lifecycle.provision(organization, sourceId);

    for (const malformed of [
      "",
      "ab_dev_fake",
      "Bearer secret",
      "a".repeat(300),
    ]) {
      await expect(
        lifecycle.authenticate(issued.deviceId, malformed),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL", status: 401 });
    }
  });

  it("does not disclose unknown device IDs during authentication", async () => {
    const { lifecycle } = setup();
    await expect(
      lifecycle.authenticate(randomUUID(), createDeviceToken()),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL", status: 401 });
  });

  it("rejects malformed device identifiers for lifecycle operations", async () => {
    const { lifecycle, organization } = setup();
    await expect(
      lifecycle.provision(organization, "not-a-uuid"),
    ).rejects.toMatchObject({
      code: "INVALID_DEVICE",
      status: 400,
    });
    await expect(
      lifecycle.authenticate("invalid-id", createDeviceToken()),
    ).rejects.toMatchObject({
      code: "INVALID_DEVICE",
      status: 400,
    });
    await expect(
      lifecycle.rotate(organization, "invalid-id"),
    ).rejects.toMatchObject({
      code: "INVALID_DEVICE",
      status: 400,
    });
    await expect(
      lifecycle.revoke(organization, "invalid-id"),
    ).rejects.toMatchObject({
      code: "INVALID_DEVICE",
      status: 400,
    });
  });

  it("rotates the credential, increments version, invalidates the old token and accepts the new one", async () => {
    const { store, lifecycle, organization, sourceId } = setup();
    const previous = await lifecycle.provision(organization, sourceId);
    const next = await lifecycle.rotate(organization, previous.deviceId);

    expect(next.deviceId).toBe(previous.deviceId);
    expect(next.version).toBe(2);
    expect(isDeviceToken(next.token)).toBe(true);
    expect(next.token).not.toBe(previous.token);
    await expect(
      lifecycle.authenticate(previous.deviceId, previous.token),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIAL",
      status: 401,
    });
    await expect(
      lifecycle.authenticate(next.deviceId, next.token),
    ).resolves.toEqual({
      deviceId: next.deviceId,
      organizationId: organization.organizationId,
      sourceId,
    });
    const row = await store.find(next.deviceId);
    expect(row?.credentialVersion).toBe(2);
    expect(row?.status).toBe("active");
  });

  it("revokes a device, records a timestamp, bumps version and blocks authentication", async () => {
    const { store, lifecycle, organization, sourceId } = setup();
    const issued = await lifecycle.provision(organization, sourceId);
    await lifecycle.revoke(organization, issued.deviceId);

    const row = await store.find(issued.deviceId);
    expect(row?.status).toBe("revoked");
    expect(row?.credentialVersion).toBe(2);
    expect(row?.revokedAt).toBeInstanceOf(Date);
    await expect(
      lifecycle.authenticate(issued.deviceId, issued.token),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIAL",
      status: 401,
    });
    await expect(
      lifecycle.rotate(organization, issued.deviceId),
    ).rejects.toMatchObject({
      code: "DEVICE_REVOKED",
      status: 409,
    });
  });

  it("treats repeated revocation as idempotent without a second update", async () => {
    const { store, lifecycle, organization, sourceId } = setup();
    const issued = await lifecycle.provision(organization, sourceId);
    await lifecycle.revoke(organization, issued.deviceId);
    const before = await store.find(issued.deviceId);
    const priorUpdateCount = store.updateCount;
    await lifecycle.revoke(organization, issued.deviceId);
    const after = await store.find(issued.deviceId);

    expect(after).toEqual(before);
    expect(store.updateCount).toBe(priorUpdateCount);
  });

  it("denies cross-org rotation and revocation and leaves the original credential usable", async () => {
    const { store, lifecycle, organization, sourceId } = setup();
    const issued = await lifecycle.provision(organization, sourceId);
    const outsider = actor();

    await expect(
      lifecycle.rotate(outsider, issued.deviceId),
    ).rejects.toMatchObject({
      code: "DEVICE_SCOPE_DENIED",
      status: 403,
    });
    await expect(
      lifecycle.revoke(outsider, issued.deviceId),
    ).rejects.toMatchObject({
      code: "DEVICE_SCOPE_DENIED",
      status: 403,
    });
    expect((await store.find(issued.deviceId))?.credentialVersion).toBe(1);
    await expect(
      lifecycle.authenticate(issued.deviceId, issued.token),
    ).resolves.toMatchObject({
      organizationId: organization.organizationId,
    });
  });

  it("reports missing devices for rotation and revocation without changing storage", async () => {
    const { store, lifecycle, organization } = setup();
    const missing = randomUUID();
    await expect(lifecycle.rotate(organization, missing)).rejects.toMatchObject(
      {
        code: "DEVICE_NOT_FOUND",
        status: 404,
      },
    );
    await expect(lifecycle.revoke(organization, missing)).rejects.toMatchObject(
      {
        code: "DEVICE_NOT_FOUND",
        status: 404,
      },
    );
    expect(store.updateCount).toBe(0);
  });

  it("fails closed if an atomic compare-and-swap rotation loses a race", async () => {
    const { store, lifecycle, organization, sourceId } = setup();
    const issued = await lifecycle.provision(organization, sourceId);
    store.rejectNextUpdate = true;
    await expect(
      lifecycle.rotate(organization, issued.deviceId),
    ).rejects.toMatchObject({
      code: "STALE_DEVICE_VERSION",
      status: 409,
    });
    expect((await store.find(issued.deviceId))?.credentialVersion).toBe(1);
    await expect(
      lifecycle.authenticate(issued.deviceId, issued.token),
    ).resolves.toBeDefined();
  });

  it("fails closed if an atomic compare-and-swap revocation loses a race", async () => {
    const { store, lifecycle, organization, sourceId } = setup();
    const issued = await lifecycle.provision(organization, sourceId);
    store.rejectNextUpdate = true;
    await expect(
      lifecycle.revoke(organization, issued.deviceId),
    ).rejects.toMatchObject({
      code: "STALE_DEVICE_VERSION",
      status: 409,
    });
    expect((await store.find(issued.deviceId))?.status).toBe("active");
  });

  it("allows only one of two concurrent rotations against the same credential version", async () => {
    const { store, lifecycle, organization, sourceId } = setup();
    const issued = await lifecycle.provision(organization, sourceId);
    const results = await Promise.allSettled([
      lifecycle.rotate(organization, issued.deviceId),
      lifecycle.rotate(organization, issued.deviceId),
    ]);
    const successes = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    const failure = failures[0];
    if (failure?.status !== "rejected")
      throw new Error("EXPECTED_STALE_REJECTION");
    expect(failure.reason).toMatchObject({
      code: "STALE_DEVICE_VERSION",
      status: 409,
    });
    expect((await store.find(issued.deviceId))?.credentialVersion).toBe(2);
  });

  it("does not return a usable credential when the persistence create fails", async () => {
    const { store, lifecycle, organization, sourceId } = setup();
    store.rejectNextCreate = true;
    await expect(lifecycle.provision(organization, sourceId)).rejects.toThrow(
      "SIMULATED_DB_CREATE_FAILURE",
    );
  });
});
