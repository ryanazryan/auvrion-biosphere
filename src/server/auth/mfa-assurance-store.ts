import "server-only";

import { and, eq, gt } from "drizzle-orm";
import { RECENT_SENSITIVE_ASSURANCE_METHOD } from "@/server/auth/mfa-login-method";
import { getDb } from "@/server/db";
import {
  type MfaAssuranceMethod,
  mfaSessionAssurance,
} from "@/server/db/mfa-assurance-schema";

// Batas usia assurance untuk V1.
// Setelah melewati batas ini, sesi perlu diautentikasi ulang
// untuk melakukan tindakan administratif.
const MAX_ASSURANCE_AGE_MS = 8 * 60 * 60 * 1000;

type RecordAssuranceInput = {
  sessionId: string;
  userId: string;
  sessionExpiresAt: Date;
  method: MfaAssuranceMethod;
};

type CheckAssuranceInput = {
  sessionId: string;
  userId: string;
};

export async function recordMfaSessionAssurance({
  sessionId,
  userId,
  sessionExpiresAt,
  method,
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
      method,
      verifiedAt: now,
      expiresAt,
    })
    .onConflictDoNothing({
      target: mfaSessionAssurance.sessionId,
    });
}

export type MfaAssuranceState = "valid" | "expired" | "missing";

/** Pure classifier used by both the UI status check and tests. */
export function classifyMfaExpiry(
  expiresAt: Date | null,
  nowMs: number,
): MfaAssuranceState {
  if (!expiresAt) return "missing";
  return expiresAt.getTime() > nowMs ? "valid" : "expired";
}

/** Active TOTP users with missing/expired assurance need a new full login. */
export function mustReauthenticate(
  state: MfaAssuranceState,
  status: string | null,
  totpEnabled: boolean,
): boolean {
  return (
    state === "expired" ||
    (state === "missing" && status === "active" && totpEnabled)
  );
}

/** Missing != expired: new enrollment sessions must NOT be signed out. */
export async function getMfaAssuranceState({
  sessionId,
  userId,
}: CheckAssuranceInput): Promise<MfaAssuranceState> {
  if (!sessionId || !userId) return "missing";
  const [record] = await getDb()
    .select({ expiresAt: mfaSessionAssurance.expiresAt })
    .from(mfaSessionAssurance)
    .where(
      and(
        eq(mfaSessionAssurance.sessionId, sessionId),
        eq(mfaSessionAssurance.userId, userId),
      ),
    )
    .limit(1);
  if (!record) return "missing";
  return classifyMfaExpiry(record.expiresAt, Date.now());
}

/** Recent authentication is required when binding/removing hardware credentials. */
export async function hasRecentMfaAssurance({
  sessionId,
  userId,
}: CheckAssuranceInput): Promise<boolean> {
  if (!sessionId || !userId) return false;
  const now = new Date();
  const [record] = await getDb()
    .select({ sessionId: mfaSessionAssurance.sessionId })
    .from(mfaSessionAssurance)
    .where(
      and(
        eq(mfaSessionAssurance.sessionId, sessionId),
        eq(mfaSessionAssurance.userId, userId),
        gt(mfaSessionAssurance.expiresAt, now),
        eq(mfaSessionAssurance.method, RECENT_SENSITIVE_ASSURANCE_METHOD),
        gt(
          mfaSessionAssurance.verifiedAt,
          new Date(now.getTime() - 5 * 60_000),
        ),
      ),
    )
    .limit(1);
  return Boolean(record);
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
