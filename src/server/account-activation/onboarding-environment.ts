type OnboardingEnvironment = {
  NODE_ENV?: string;
  ENABLE_LOCAL_ACCESS_REQUESTS?: string;
  ENABLE_PRODUCTION_ONBOARDING?: string;
  BETTER_AUTH_URL?: string;
};

export function onboardingEnabled(env: OnboardingEnvironment): boolean {
  if (env.NODE_ENV === "development") {
    return env.ENABLE_LOCAL_ACCESS_REQUESTS === "YES";
  }

  if (env.NODE_ENV === "production") {
    return env.ENABLE_PRODUCTION_ONBOARDING === "YES";
  }

  return false;
}

export function isAllowedOnboardingOrigin(
  request: Request,
  env: OnboardingEnvironment,
): boolean {
  if (!onboardingEnabled(env)) return false;

  try {
    const configured = new URL(env.BETTER_AUTH_URL ?? "");
    const incoming = new URL(request.url);

    if (env.NODE_ENV === "production") {
      if (configured.origin !== "https://auvrionbiosphere.com") {
        return false;
      }
    } else if (
      configured.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(configured.hostname)
    ) {
      return false;
    }

    // Next.js may receive an internal request URL behind an HTTPS reverse proxy.
    // Only permit that path when the public Host and Caddy-forwarded scheme/host
    // all match the configured HTTPS domain. Never trust Origin by itself.
    const publicRequest =
      incoming.origin === configured.origin ||
      (env.NODE_ENV === "production" &&
        request.headers.get("host") === configured.host &&
        request.headers.get("x-forwarded-host") === configured.host &&
        request.headers.get("x-forwarded-proto") === "https");

    return publicRequest && request.headers.get("origin") === configured.origin;
  } catch {
    return false;
  }
}
