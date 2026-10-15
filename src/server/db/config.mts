import "server-only";

const configurationError =
  "Database configuration is missing or invalid. Set DATABASE_URL for a local development database.";

/** G1B deliberately supports only local TCP connections, without URL overrides. */
export function getDatabaseUrl(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const value = environment.DATABASE_URL;
  if (!value || value !== value.trim()) {
    throw new Error(configurationError);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // URL parsing errors can contain their input, including credentials.
    throw new Error(configurationError);
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !url.username ||
    url.pathname.length <= 1 ||
    url.search ||
    url.hash
  ) {
    throw new Error(configurationError);
  }

  return value;
}
