/** Closed production beta: no anonymous unrestricted public signups. */
export function isPermittedBetaEmail(
  email: string,
  env: {
    NODE_ENV?: string;
    AUVRION_BETA_ALLOWED_EMAILS?: string;
  },
): boolean {
  if (env.NODE_ENV === "development") return true;
  if (env.NODE_ENV !== "production") return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 254) return false;
  const allowed = (env.AUVRION_BETA_ALLOWED_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(normalized);
}
