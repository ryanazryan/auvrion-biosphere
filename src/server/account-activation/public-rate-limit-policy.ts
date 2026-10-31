import { isIP } from "node:net";

export type OnboardingAction =
  | "submit"
  | "verification-email"
  | "status-email"
  | "verification-confirm"
  | "status-confirm";

export type Rule = { key: string; max: number; seconds: number };

export function resolveOnboardingClientIp(
  request: Request,
  env: NodeJS.ProcessEnv,
): string {
  if (env.NODE_ENV === "development") return "local-development";
  if (
    env.NODE_ENV !== "production" ||
    env.AUVRION_ONBOARDING_TRUST_X_REAL_IP !== "YES"
  ) {
    throw new Error("ONBOARDING_TRUSTED_PROXY_REQUIRED");
  }
  const header = request.headers.get("x-real-ip")?.trim() ?? "";
  if (!isIP(header)) throw new Error("ONBOARDING_CLIENT_IP_REQUIRED");
  return header;
}

export function onboardingRules(
  action: OnboardingAction,
  ip: string,
  email?: string,
): Rule[] {
  const emailKey = email?.trim().toLowerCase();
  const hourlyIpMax = action.endsWith("confirm") ? 30 : 10;
  const dailyGlobalMax = action.endsWith("confirm") ? 2000 : 150;
  const rules: Rule[] = [
    { key: `global:${action}`, max: dailyGlobalMax, seconds: 86400 },
    { key: `ip:${action}:${ip}`, max: hourlyIpMax, seconds: 3600 },
  ];
  if (emailKey) {
    rules.push({
      key: `email:${action}:${emailKey}`,
      max: action === "submit" ? 4 : 3,
      seconds: 86400,
    });
  }
  return rules;
}
