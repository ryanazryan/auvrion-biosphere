/** Exponential backoff; capped at one hour. Attempt 1 -> 30 seconds. */
export function notificationRetryDelaySeconds(attempts: number): number {
  const exponent = Math.max(0, Math.min(10, Math.trunc(attempts) - 1));
  return Math.min(3600, 30 * 2 ** exponent);
}
