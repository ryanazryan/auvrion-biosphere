/**
 * AB-WC-010: isolated PostgreSQL integration tests.
 *
 * Opt in with RUN_WC010_DB_TESTS=YES.
 * Only permits 127.0.0.1:5435 / auvrion_wc007_test.
 * Synthetic fixtures are always rolled back.
 */

import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { user } from "@/server/db/auth-schema";
import { organizations } from "@/server/db/grants-schema";
import {
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import {
  evidenceLinks,
  evidenceMedia,
} from "@/server/db/operations-domain-schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  checkOperationalAccess: vi.fn(),
  getScopedObservation: vi.fn(),
  savePrivateWav: vi.fn(),
  deletePrivateWav: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/server/db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.checkOperationalAccess,
}));

vi.mock("@/server/observations/observation-service", () => ({
  getScopedObservation: mocks.getScopedObservation,
}));

vi.mock("./private-storage", () => ({
  savePrivateWav: mocks.savePrivateWav,
  deletePrivateWav: mocks.deletePrivateWav,
}));

import { attachAudioToObservation } from "./evidence-service";

const ENABLED = process.env.RUN_WC010_DB_TESTS === "YES";

type Database = ReturnType<typeof drizzle>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function isolatedDatabaseUrl(): string {
  loadEnvFile(".env.local");

  const dev = new URL(process.env.DATABASE_URL ?? "postgres://invalid");

  if (
    !["postgres:", "postgresql:"].includes(dev.protocol) ||
    dev.hostname !== "127.0.0.1" ||
    dev.port !== "5433" ||
    dev.pathname !== "/auvrion_dev" ||
    decodeURIComponent(dev.username) !== "auvrion_dev"
  ) {
    throw new Error("WC010_REFUSED_UNKNOWN_DEV_DATABASE");
  }

  dev.port = "5435";
  dev.pathname = "/auvrion_wc007_test";

  return dev.toString();
}

type Fixture = {
  organizationA: string;
  organizationB: string;
  observationA: string;
  observationB: string;
  actorId: string;
};

async function withRolledBackFixture(
  database: Database,
  exercise: (tx: Transaction, fixture: Fixture) => Promise<void>,
): Promise<void> {
  const rollback = new Error("WC010_EXPECTED_ROLLBACK");

  try {
    await database.transaction(async (tx) => {
      mocks.getDb.mockReturnValue(tx);

      const fixture: Fixture = {
        organizationA: randomUUID(),
        organizationB: randomUUID(),
        observationA: randomUUID(),
        observationB: randomUUID(),
        actorId: `wc010-${randomUUID()}`,
      };

      const sourceA = randomUUID();
      const sourceB = randomUUID();

      await tx.insert(user).values({
        id: fixture.actorId,
        name: "WC010 Synthetic Actor",
        email: `${fixture.actorId}@example.invalid`,
      });

      await tx.insert(organizations).values([
        {
          id: fixture.organizationA,
          code: `WC010-A-${fixture.organizationA}`,
          name: "WC010 Synthetic Organization A",
        },
        {
          id: fixture.organizationB,
          code: `WC010-B-${fixture.organizationB}`,
          name: "WC010 Synthetic Organization B",
        },
      ]);

      await tx.insert(observationSources).values([
        {
          id: sourceA,
          organizationId: fixture.organizationA,
          kind: "manual",
          code: "WC010-MANUAL-A",
          label: "Synthetic Source A",
        },
        {
          id: sourceB,
          organizationId: fixture.organizationB,
          kind: "manual",
          code: "WC010-MANUAL-B",
          label: "Synthetic Source B",
        },
      ]);

      await tx.insert(observations).values([
        {
          id: fixture.observationA,
          organizationId: fixture.organizationA,
          sourceId: sourceA,
          domain: "biodiversity",
          ingestionMode: "historical",
          observedAt: new Date(),
          locationUnknownReason: "test-fixture",
        },
        {
          id: fixture.observationB,
          organizationId: fixture.organizationB,
          sourceId: sourceB,
          domain: "biodiversity",
          ingestionMode: "historical",
          observedAt: new Date(),
          locationUnknownReason: "test-fixture",
        },
      ]);

      mocks.checkOperationalAccess.mockResolvedValue({
        allowed: true,
        userId: fixture.actorId,
        organizationId: fixture.organizationA,
        role: "operator",
      });

      mocks.getScopedObservation.mockImplementation(
        async (organizationId: string, id: string) => {
          if (
            organizationId === fixture.organizationA &&
            id === fixture.observationA
          ) {
            return {
              id,
              domain: "biodiversity",
            };
          }

          return null;
        },
      );

      mocks.savePrivateWav.mockResolvedValue({
        storageKey: `${randomUUID()}.wav`,
        sha256: "a".repeat(64),
        mimeType: "audio/wav",
        byteLength: 96044,
        durationSeconds: 1,
      });

      mocks.deletePrivateWav.mockResolvedValue(undefined);

      await exercise(tx, fixture);

      // All synthetic database rows are discarded.
      throw rollback;
    });

    throw new Error("WC010_FIXTURE_UNEXPECTEDLY_COMMITTED");
  } catch (error) {
    if (error !== rollback) {
      throw error;
    }
  } finally {
    vi.resetAllMocks();
  }
}

describe.skipIf(!ENABLED)("AB-WC-010 evidence PostgreSQL integration", () => {
  let pool: Pool | undefined;
  let database: Database;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: isolatedDatabaseUrl(),
      max: 1,
      connectionTimeoutMillis: 5000,
    });

    const identity = await pool.query(
      "SELECT current_database() AS name, current_user AS username",
    );

    if (
      identity.rows[0]?.name !== "auvrion_wc007_test" ||
      identity.rows[0]?.username !== "auvrion_dev"
    ) {
      throw new Error("WC010_REFUSED_UNEXPECTED_DATABASE");
    }

    database = drizzle({ client: pool });
  }, 20000);

  afterAll(async () => {
    vi.resetAllMocks();
    await pool?.end();
  });

  it("persists evidence media and its observation link", async () => {
    await withRolledBackFixture(database, async (tx, fixture) => {
      const result = await attachAudioToObservation({
        organizationId: fixture.organizationA,
        observationId: fixture.observationA,
        bytes: new Uint8Array([1, 2, 3]),
        declaredMimeType: "audio/wav",
      });

      const media = await tx
        .select()
        .from(evidenceMedia)
        .where(eq(evidenceMedia.id, result.mediaId));

      const links = await tx
        .select()
        .from(evidenceLinks)
        .where(eq(evidenceLinks.mediaId, result.mediaId));

      expect(media).toHaveLength(1);
      expect(links).toHaveLength(1);

      expect(media[0]).toMatchObject({
        organizationId: fixture.organizationA,
        availability: "available",
        sha256: "a".repeat(64),
        mimeType: "audio/wav",
        byteLength: 96044,
        createdByUserId: fixture.actorId,
      });

      expect(links[0]).toMatchObject({
        organizationId: fixture.organizationA,
        observationId: fixture.observationA,
        linkedByUserId: fixture.actorId,
      });

      expect(mocks.deletePrivateWav).not.toHaveBeenCalled();
    });
  });

  it("rolls back media if its observation belongs to another organization", async () => {
    await withRolledBackFixture(database, async (tx, fixture) => {
      // Deliberately simulate a broken service-level scope
      // check to verify the database FK still protects us.
      mocks.getScopedObservation.mockResolvedValue({
        id: fixture.observationB,
        domain: "biodiversity",
      });

      await expect(
        attachAudioToObservation({
          organizationId: fixture.organizationA,
          observationId: fixture.observationB,
          bytes: new Uint8Array([1, 2, 3]),
          declaredMimeType: "audio/wav",
        }),
      ).rejects.toMatchObject({
        status: 500,
        reason: "EVIDENCE_PERSISTENCE_FAILED",
      });

      const remainingMedia = await tx
        .select()
        .from(evidenceMedia)
        .where(eq(evidenceMedia.organizationId, fixture.organizationA));

      expect(remainingMedia).toHaveLength(0);
      expect(mocks.deletePrivateWav).toHaveBeenCalledOnce();
    });
  });

  it("refuses unauthorized attachment before any file write", async () => {
    await withRolledBackFixture(database, async (_tx, fixture) => {
      mocks.checkOperationalAccess.mockResolvedValue({
        allowed: false,
        status: 403,
        reason: "ROLE_OR_SCOPE_DENIED",
      });

      await expect(
        attachAudioToObservation({
          organizationId: fixture.organizationA,
          observationId: fixture.observationA,
          bytes: new Uint8Array([1, 2, 3]),
          declaredMimeType: "audio/wav",
        }),
      ).rejects.toMatchObject({
        status: 403,
        reason: "ROLE_OR_SCOPE_DENIED",
      });

      expect(mocks.savePrivateWav).not.toHaveBeenCalled();
    });
  });
});
