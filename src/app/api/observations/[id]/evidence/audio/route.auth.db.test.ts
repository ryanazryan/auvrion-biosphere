/**
 * AB-WC-010 — Signed session + PostgreSQL + private audio.
 *
 * Handler-level integration, NOT a real network request.
 * MFA assurance is seeded as a fixture; no TOTP challenge is performed.
 *
 * RUN_WC010_HTTP_DB_TESTS=YES
 * Database: 127.0.0.1:5435/auvrion_wc007_test ONLY.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile } from "node:process";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { accessApplications, userAccess } from "@/server/db/access-schema";
import { account, user } from "@/server/db/auth-schema";
import { organizations, roleGrants } from "@/server/db/grants-schema";
import { mfaSessionAssurance } from "@/server/db/mfa-assurance-schema";
import {
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import {
  evidenceLinks,
  evidenceMedia,
} from "@/server/db/operations-domain-schema";

const adapter = vi.hoisted(() => ({
  getDb: vi.fn(),
  cookie: "",
}));

vi.mock("server-only", () => ({}));

vi.mock("@/server/db", () => ({
  getDb: adapter.getDb,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: adapter.cookie }),
}));

const ENABLED = process.env.RUN_WC010_HTTP_DB_TESTS === "YES";
const ORIGIN = "http://localhost:3000";
const PASSWORD = `WC010-Local-${randomUUID()}-Strong#1`;

type Database = ReturnType<typeof drizzle>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type Persona = {
  cookie: string;
  userId: string;
  sessionId: string;
};

function isolatedDatabaseUrl(): string {
  loadEnvFile(".env.local");

  const source = new URL(process.env.DATABASE_URL ?? "postgres://invalid");

  if (
    !["postgres:", "postgresql:"].includes(source.protocol) ||
    source.hostname !== "127.0.0.1" ||
    source.port !== "5433" ||
    source.pathname !== "/auvrion_dev" ||
    decodeURIComponent(source.username) !== "auvrion_dev"
  ) {
    throw new Error("WC010_HTTP_REFUSED_DEV_DATABASE");
  }

  source.port = "5435";
  source.pathname = "/auvrion_wc007_test";

  return source.toString();
}

function validWav(): Buffer {
  const sampleRate = 48000;
  const dataLength = sampleRate * 2;
  const buffer = Buffer.alloc(44 + dataLength);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVE", 8, "ascii");

  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);

  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

describe.skipIf(!ENABLED)(
  "AB-WC-010 signed-session secure upload integration",
  () => {
    let pool: Pool | undefined;
    let database: Database;
    let privateRoot: string;

    beforeAll(async () => {
      const url = isolatedDatabaseUrl();

      if (
        !process.env.BETTER_AUTH_SECRET ||
        process.env.BETTER_AUTH_SECRET.length < 32
      ) {
        throw new Error("WC010_REQUIRES_LOCAL_AUTH_SECRET");
      }

      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
      vi.stubEnv("ENABLE_LOCAL_ACCESS_REQUESTS", "YES");

      privateRoot = await mkdtemp(join(tmpdir(), "auvrion-wc010-http-"));

      vi.stubEnv("PRIVATE_EVIDENCE_DIR", privateRoot);

      pool = new Pool({
        connectionString: url,
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
        throw new Error("WC010_REFUSED_TEST_DATABASE_IDENTITY");
      }

      database = drizzle({ client: pool });
    }, 20000);

    afterAll(async () => {
      adapter.cookie = "";
      adapter.getDb.mockReset();

      try {
        await pool?.end();
        if (privateRoot) {
          await rm(privateRoot, {
            recursive: true,
            force: true,
          });
        }
      } finally {
        vi.unstubAllEnvs();
      }
    }, 20000);

    it("enforces signed sessions, roles, MFA, tenant isolation, and persists private WAV", async () => {
      const expectedRollback = new Error("WC010_EXPECTED_FIXTURE_ROLLBACK");

      await expect(
        database.transaction(async (tx: Transaction) => {
          // Auth is imported only after its DB adapter
          // has been directed to this isolated transaction.
          adapter.getDb.mockReturnValue(tx);

          const [{ auth }, { hashPassword }, { POST }] = await Promise.all([
            import("@/server/auth"),
            import("better-auth/crypto"),
            import("./route"),
          ]);

          const orgA = randomUUID();
          const orgB = randomUUID();
          const sourceA = randomUUID();
          const sourceB = randomUUID();
          const observationA = randomUUID();
          const observationB = randomUUID();
          const actorId = `wc010-actor-${randomUUID()}`;

          await tx.insert(user).values({
            id: actorId,
            name: "WC010 Synthetic Actor",
            email: `${actorId}@example.invalid`,
            emailVerified: true,
          });

          await tx.insert(organizations).values([
            {
              id: orgA,
              code: `WC010-A-${orgA}`,
              name: "WC010 Test Organization A",
            },
            {
              id: orgB,
              code: `WC010-B-${orgB}`,
              name: "WC010 Test Organization B",
            },
          ]);

          await tx.insert(observationSources).values([
            {
              id: sourceA,
              organizationId: orgA,
              kind: "manual",
              code: "WC010-A",
              label: "Test Source A",
            },
            {
              id: sourceB,
              organizationId: orgB,
              kind: "manual",
              code: "WC010-B",
              label: "Test Source B",
            },
          ]);

          await tx.insert(observations).values([
            {
              id: observationA,
              organizationId: orgA,
              sourceId: sourceA,
              domain: "biodiversity",
              ingestionMode: "historical",
              observedAt: new Date(),
              locationUnknownReason: "test-fixture",
            },
            {
              id: observationB,
              organizationId: orgB,
              sourceId: sourceB,
              domain: "biodiversity",
              ingestionMode: "historical",
              observedAt: new Date(),
              locationUnknownReason: "test-fixture",
            },
          ]);

          async function persona(
            role: "operator" | "supervisor",
            organizationId: string,
            assured: boolean,
          ): Promise<Persona> {
            const userId = `wc010-user-${randomUUID()}`;
            const applicationId = randomUUID();
            const now = new Date();

            const email = `${userId}@example.invalid`;

            await tx.insert(user).values({
              id: userId,
              name: "WC010 Synthetic User",
              email,
              emailVerified: true,
            });

            await tx.insert(account).values({
              id: `credential-${randomUUID()}`,
              accountId: userId,
              providerId: "credential",
              userId,
              password: await hashPassword(PASSWORD),
            });

            await tx.insert(accessApplications).values({
              id: applicationId,
              applicantName: "WC010 Synthetic User",
              email,
              status: "approved",
              emailVerifiedAt: now,
              reviewedAt: now,
              reviewedById: actorId,
            });

            await tx.insert(userAccess).values({
              userId,
              applicationId,
              status: "active",
              activatedAt: now,
            });

            await tx.insert(roleGrants).values({
              userId,
              organizationId,
              role,
              grantedById: actorId,
            });

            const login = await auth.api.signInEmail({
              body: {
                email,
                password: PASSWORD,
              },
              headers: new Headers({ Origin: ORIGIN }),
              asResponse: true,
            });

            expect(login.status).toBe(200);

            const cookies = login.headers
              .getSetCookie()
              .map((value) => value.split(";")[0])
              .filter((value) => value.includes("session_token="));

            expect(cookies).toHaveLength(1);

            const cookie = cookies[0];
            const current = await auth.api.getSession({
              headers: new Headers({ cookie }),
            });

            expect(current?.user.id).toBe(userId);

            const sessionId = current?.session.id ?? "";
            expect(sessionId).toBeTruthy();

            if (assured) {
              // Fixture, NOT proof of an actual TOTP login.
              await tx.insert(mfaSessionAssurance).values({
                sessionId,
                userId,
                verifiedAt: new Date(),
                expiresAt: new Date(Date.now() + 20 * 60_000),
              });
            }

            return { cookie, userId, sessionId };
          }

          const operator = await persona("operator", orgA, true);
          const foreignOperator = await persona("operator", orgB, true);
          const supervisor = await persona("supervisor", orgA, true);
          const unassured = await persona("operator", orgA, false);

          const wav = validWav();

          async function upload(
            cookie: string,
            organizationId = orgA,
            id = observationA,
          ) {
            adapter.cookie = cookie;

            // Dedicated ArrayBuffer fixes TS6 BodyInit typing.
            const body = new Uint8Array(new ArrayBuffer(wav.length));
            body.set(wav);

            return POST(
              new Request(
                `${ORIGIN}/api/observations/${id}` +
                  `/evidence/audio?organizationId=${organizationId}`,
                {
                  method: "POST",
                  headers: {
                    Origin: ORIGIN,
                    "Content-Type": "audio/wav",
                    Cookie: cookie,
                  },
                  body,
                },
              ),
              { params: Promise.resolve({ id }) },
            );
          }

          // 1. Missing and forged signed sessions.
          expect((await upload("")).status).toBe(401);
          expect(
            (await upload("better-auth.session_token=forged.invalid")).status,
          ).toBe(401);

          // 2. Missing current-session MFA assurance.
          expect((await upload(unassured.cookie)).status).toBe(403);

          // 3. Wrong operational role.
          expect((await upload(supervisor.cookie)).status).toBe(403);

          // 4. Operator from organization B cannot use A.
          expect((await upload(foreignOperator.cookie)).status).toBe(403);

          // 5. Operator A cannot target observation B
          // while selecting organization A.
          expect(
            (await upload(operator.cookie, orgA, observationB)).status,
          ).toBe(404);

          // No denied request may create private audio.
          expect(await readdir(privateRoot)).toHaveLength(0);

          // 6. Valid signed Operator session.
          const response = await upload(operator.cookie);

          expect(response.status).toBe(201);
          expect(response.headers.get("cache-control")).toBe("no-store");

          const payload = (await response.json()) as {
            mediaId: string;
            byteLength: number;
            durationSeconds: number;
          };

          expect(payload.mediaId).toBeTruthy();
          expect(payload.byteLength).toBe(wav.length);
          expect(payload.durationSeconds).toBe(1);

          // Never leak storage key via HTTP response.
          expect(payload).not.toHaveProperty("storageKey");
          expect(payload).not.toHaveProperty("sha256");

          const media = await tx
            .select()
            .from(evidenceMedia)
            .where(eq(evidenceMedia.id, payload.mediaId));

          const links = await tx
            .select()
            .from(evidenceLinks)
            .where(eq(evidenceLinks.mediaId, payload.mediaId));

          expect(media).toHaveLength(1);
          expect(links).toHaveLength(1);

          expect(media[0]).toMatchObject({
            organizationId: orgA,
            availability: "available",
            mimeType: "audio/wav",
            byteLength: wav.length,
            createdByUserId: operator.userId,
          });

          expect(links[0]).toMatchObject({
            organizationId: orgA,
            observationId: observationA,
          });

          const storedMedia = media[0];

          if (!storedMedia?.sha256) {
            throw new Error("WC010_TEST_MEDIA_METADATA_MISSING");
          }

          const storedBytes = await readFile(
            join(privateRoot, storedMedia.storageKey),
          );

          expect(storedBytes).toEqual(wav);

          expect(createHash("sha256").update(storedBytes).digest("hex")).toBe(
            storedMedia.sha256,
          );

          // Roll back all users, sessions, observations
          // and evidence metadata created by this test.
          throw expectedRollback;
        }),
      ).rejects.toBe(expectedRollback);
    }, 90000);
  },
);
