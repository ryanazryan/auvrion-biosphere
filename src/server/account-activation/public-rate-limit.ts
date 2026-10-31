import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  type OnboardingAction,
  onboardingRules,
  resolveOnboardingClientIp,
} from "./public-rate-limit-policy";

/** Shared PostgreSQL budgets: atomic across workers, fail closed on database error. */
function hashedKey(prefix: string, value: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("ONBOARDING_HMAC_SECRET_REQUIRED");
  return createHmac("sha256", secret)
    .update("auvrion-public-onboarding-v1:")
    .update(prefix)
    .update(":")
    .update(value)
    .digest("hex");
}

export async function consumeOnboardingBudget(
  request: Request,
  action: OnboardingAction,
  email?: string,
): Promise<boolean> {
  const ip = resolveOnboardingClientIp(request, process.env);
  const rules = onboardingRules(action, ip, email);
  const db = getDb();
  return await db.transaction(async (tx) => {
    // Identical ordering across callers prevents circular row-lock waits.
    for (const rule of rules) {
      const key = hashedKey("rate", rule.key);
      const seconds = rule.seconds;
      const result = await tx.execute(sql`
        INSERT INTO onboarding_rate_limit_buckets
          (bucket_key, window_start, hits, updated_at)
        VALUES (${key}, now(), 1, now())
        ON CONFLICT (bucket_key) DO UPDATE
        SET hits = CASE
              WHEN onboarding_rate_limit_buckets.window_start <= now() - (${seconds} * INTERVAL '1 second')
              THEN 1 ELSE onboarding_rate_limit_buckets.hits + 1 END,
            window_start = CASE
              WHEN onboarding_rate_limit_buckets.window_start <= now() - (${seconds} * INTERVAL '1 second')
              THEN now() ELSE onboarding_rate_limit_buckets.window_start END,
            updated_at = now()
        RETURNING hits
      `);
      if (Number(result.rows[0]?.hits ?? 0) > rule.max) return false;
    }
    return true;
  });
}
