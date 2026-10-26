/** Bounded per-user, per-organization budget for model point inspection.
 * In-memory only; use an authoritative distributed rate limiter for multi-instance deployments.
 * A full store fails closed for unseen keys rather than resetting everyone's counters.
 */
export type BudgetDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type Entry = { count: number; until: number };

type Options = { limit?: number; windowMs?: number; maxEntries?: number };

export function createPointRateLimiter(options: Options = {}) {
  const { limit = 24, windowMs = 600_000, maxEntries = 300 } = options;
  if (limit < 1 || windowMs < 1 || maxEntries < 1) {
    throw new Error("INVALID_POINT_RATE_LIMIT_OPTIONS");
  }
  const budgets = new Map<string, Entry>();
  return {
    consume(key: string, now = Date.now()): BudgetDecision {
      if (!key) throw new Error("POINT_RATE_LIMIT_KEY_REQUIRED");
      const existing = budgets.get(key);
      if (existing && existing.until > now) {
        if (existing.count >= limit) {
          return {
            allowed: false,
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((existing.until - now) / 1000),
            ),
          };
        }
        existing.count += 1;
        return { allowed: true };
      }
      if (existing) budgets.delete(key);
      if (budgets.size >= maxEntries) {
        for (const [id, entry] of budgets) {
          if (entry.until <= now) budgets.delete(id);
        }
      }
      if (budgets.size >= maxEntries) {
        const earliest = Math.min(
          ...Array.from(budgets.values(), (item) => item.until),
        );
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((earliest - now) / 1000)),
        };
      }
      budgets.set(key, { until: now + windowMs, count: 1 });
      return { allowed: true };
    },
  };
}
