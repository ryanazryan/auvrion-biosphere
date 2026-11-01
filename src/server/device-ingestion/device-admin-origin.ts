/** Strict browser same-origin check for device administration behind Caddy. */
export function trustedAdminOrigin(
  request: Request,
  env: { NODE_ENV?: string; BETTER_AUTH_URL?: string },
): boolean {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return false;
  if (
    (request.headers.get("sec-fetch-site") ?? "same-origin") !== "same-origin"
  )
    return false;
  try {
    const source = new URL(originHeader);
    const target = new URL(request.url);
    if (source.origin === target.origin) return true;
    if (env.NODE_ENV !== "production") return false;
    const configured = new URL(env.BETTER_AUTH_URL ?? "");
    if (configured.origin !== "https://auvrionbiosphere.com") return false;
    return (
      source.origin === configured.origin &&
      request.headers.get("host") === configured.host &&
      request.headers.get("x-forwarded-host") === configured.host &&
      request.headers.get("x-forwarded-proto") === "https"
    );
  } catch {
    return false;
  }
}
