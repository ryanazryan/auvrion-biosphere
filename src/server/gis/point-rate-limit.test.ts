import { describe, expect, it } from "vitest";
import { createPointRateLimiter } from "./point-rate-limit";

describe("AQI per-user point inspection limiter", () => {
  it("limits requests within an interval and provides Retry-After", () => {
    const budget = createPointRateLimiter({ limit: 2, windowMs: 10_000 });
    expect(budget.consume("org:user", 1000)).toEqual({ allowed: true });
    expect(budget.consume("org:user", 2000)).toEqual({ allowed: true });
    expect(budget.consume("org:user", 3000)).toEqual({
      allowed: false,
      retryAfterSeconds: 8,
    });
    expect(budget.consume("org:user", 11_000)).toEqual({ allowed: true });
  });
  it("preserves counters instead of clearing all budgets at full capacity", () => {
    const budget = createPointRateLimiter({
      limit: 2,
      windowMs: 10_000,
      maxEntries: 2,
    });
    expect(budget.consume("one", 0)).toEqual({ allowed: true });
    expect(budget.consume("two", 0)).toEqual({ allowed: true });
    expect(budget.consume("three", 1)).toEqual({
      allowed: false,
      retryAfterSeconds: 10,
    });
    expect(budget.consume("one", 2)).toEqual({ allowed: true });
    expect(budget.consume("one", 3)).toEqual({
      allowed: false,
      retryAfterSeconds: 10,
    });
    expect(budget.consume("three", 10_001)).toEqual({ allowed: true });
  });
});
