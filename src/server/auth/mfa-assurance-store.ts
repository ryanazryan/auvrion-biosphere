import "server-only";

import { and, eq, gt } from "drizzle-orm";

import { getDb } from "@/server/db";
import { mfaSessionAssurance } from "@/server/db/mfa-assurance-schema";

// Batas usia assurance untuk V1.
// Setelah melewati batas ini, sesi perlu diautentikasi ulang
// untuk melakukan tindakan administratif.
const MAX_ASSURANCE_AGE_MS = 8 * 60 * 60 * 1000;

type RecordAssuranceInput = {
  sessionId: string;
  userId: string;
  sessionExpiresAt: Date;
};

type CheckAssuranceInput = {
  sessionId: string;
  userId: string;
};

export async function recordMfaSessionAssurance({
  sessionId,
  userId,
  sessionExpiresAt,
}: RecordAssuranceInput): Promise<void> {
  if (!sessionId || !userId) {
    throw new Error("INVALID_MFA_SESSION_IDENTITY");
  }

  const now = new Date();

  const expiresAt = new Date(
    Math.min(sessionExpiresAt.getTime(), now.getTime() + MAX_ASSURANCE_AGE_MS),
  );

  if (
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.getTime() <= now.getTime()
  ) {
    throw new Error("INVALID_MFA_SESSION_EXPIRY");
  }

  await getDb()
    .insert(mfaSessionAssurance)
    .values({
      sessionId,
      userId,
      verifiedAt: now,
      expiresAt,
    })
    .onConflictDoNothing({
      target: mfaSessionAssurance.sessionId,
    });
}

export async function hasMfaSessionAssurance({
  sessionId,
  userId,
}: CheckAssuranceInput): Promise<boolean> {
  if (!sessionId || !userId) {
    return false;
  }

  const [record] = await getDb()
    .select({
      sessionId: mfaSessionAssurance.sessionId,
    })
    .from(mfaSessionAssurance)
    .where(
      and(
        eq(mfaSessionAssurance.sessionId, sessionId),
        eq(mfaSessionAssurance.userId, userId),
        gt(mfaSessionAssurance.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return Boolean(record);
}
