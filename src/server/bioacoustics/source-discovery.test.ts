import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { observations } from "@/server/db/observation-domain-schema";
import { evidenceMedia } from "@/server/db/operations-domain-schema";

const mocks = vi.hoisted(() => ({
  checkOperationalAccess: vi.fn(),
  getDb: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/authorization/operational-access", () => ({
  checkOperationalAccess: mocks.checkOperationalAccess,
}));
vi.mock("@/server/db", () => ({ getDb: mocks.getDb }));

import {
  BioacousticDiscoveryError,
  listAuthorizedBioacousticSources,
} from "./source-discovery";

const ORG = "11111111-1111-4111-8111-111111111111";
const OBS = "22222222-2222-4222-8222-222222222222";
const SHA = "a".repeat(64);
type Fixture = {
  observation?: { domain: "biodiversity" | "environmental_risk" };
  manual?: Record<string, unknown>[];
  device?: Record<string, unknown>[];
};

function database(fixture: Fixture = {}) {
  const predicates: Array<{ table: unknown; predicate: SQL }> = [];
  const obsRows = fixture.observation
    ? [fixture.observation]
    : [{ domain: "biodiversity" }];
  const db = {
    select: vi.fn((_columns: unknown) => ({
      from: (table: unknown) => {
        const where = (predicate: SQL) => {
          predicates.push({ table, predicate });
          const result =
            table === observations
              ? obsRows
              : table === evidenceMedia
                ? (fixture.manual ?? [])
                : (fixture.device ?? []);
          return table === observations
            ? { limit: async (_count: number) => result }
            : {
                orderBy: (..._args: unknown[]) => ({
                  limit: async (_count: number) => result,
                }),
              };
        };
        return table === evidenceMedia
          ? { innerJoin: (_table: unknown, _condition: SQL) => ({ where }) }
          : { where };
      },
    })),
  };
  mocks.getDb.mockReturnValue(db);
  return { db, predicates };
}

async function invoke() {
  return listAuthorizedBioacousticSources({
    organizationId: ORG,
    observationId: OBS,
  });
}

describe("WC-023 scoped, metadata-only bioacoustic discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: true,
      userId: "operator-user",
      organizationId: ORG,
      role: "operator",
    });
  });
  it("refuses unauthorized access before any DB lookup", async () => {
    const { db } = database();
    mocks.checkOperationalAccess.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "MFA_ASSURANCE_REQUIRED",
    });
    await expect(invoke()).rejects.toMatchObject({
      status: 403,
      code: "MFA_ASSURANCE_REQUIRED",
    });
    expect(db.select).not.toHaveBeenCalled();
  });
  it("refuses invalid selectors before checking role grants", async () => {
    await expect(
      listAuthorizedBioacousticSources({
        organizationId: "bad",
        observationId: OBS,
      }),
    ).rejects.toBeInstanceOf(BioacousticDiscoveryError);
    expect(mocks.checkOperationalAccess).not.toHaveBeenCalled();
  });
  it("refuses missing scoped observation", async () => {
    database({ observation: undefined });
    // Mark fixture as an explicit missing result.
    mocks.getDb.mockReturnValue({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      }),
    });
    await expect(invoke()).rejects.toMatchObject({ status: 404 });
  });
  it("never tries to query WAVs for environmental-risk observations", async () => {
    const { db } = database({ observation: { domain: "environmental_risk" } });
    expect(await invoke()).toEqual({
      status: "unsupported_domain",
      sources: [],
      verification: "no_ai_predictions_available",
    });
    expect(db.select).toHaveBeenCalledTimes(1);
  });
  it("includes valid manual evidence and device receipts without storage keys", async () => {
    database({
      manual: [
        {
          id: "manual-media",
          sha256: SHA,
          byteLength: 98000,
          mimeType: "audio/wav",
          availability: "available",
          createdAt: new Date("2026-10-20T08:00:00Z"),
          storageKey: "NEVER_EXPOSE",
        },
      ],
      device: [
        {
          id: "device-receipt",
          sha256: SHA,
          byteLength: 100000,
          createdAt: new Date("2026-10-20T08:30:00Z"),
          storageKey: "NEVER_EXPOSE",
        },
      ],
    });
    const discovered = await invoke();
    expect(discovered.status).toBe("analyzer_not_configured");
    expect(discovered.sources).toHaveLength(2);
    expect(discovered.sources.map((v) => v.kind)).toEqual([
      "human_uploaded_audio",
      "device_recording",
    ]);
    expect(
      discovered.sources.every(
        (v) => v.integrity === "not_verified_for_analysis",
      ),
    ).toBe(true);
    expect(JSON.stringify(discovered)).not.toContain("NEVER_EXPOSE");
  });
  it("rejects incomplete and unavailable evidence metadata", async () => {
    database({
      manual: [
        {
          id: "failed",
          sha256: SHA,
          byteLength: 1000,
          mimeType: "audio/wav",
          availability: "failed",
          createdAt: new Date(),
        },
      ],
      device: [
        {
          id: "invalid",
          sha256: "bad",
          byteLength: 1200,
          createdAt: new Date(),
        },
      ],
    });
    expect((await invoke()).status).toBe("no_audio");
  });
  it("scopes all three queries by authorized organization and observation", async () => {
    const { predicates } = database();
    await invoke();
    expect(predicates).toHaveLength(3);
    for (const predicate of predicates) {
      const sql = new PgDialect().sqlToQuery(predicate.predicate);
      expect(sql.params).toContain(ORG);
      expect(sql.params).toContain(OBS);
    }
    expect(mocks.checkOperationalAccess).toHaveBeenCalledWith(ORG, "operator");
  });
});
