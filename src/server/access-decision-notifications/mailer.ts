import "server-only";

import { onboardingEnabled } from "@/server/account-activation/onboarding-environment";
import { sendApplicationEmail } from "@/server/mail/transport";
import { type AccessDecision, buildDecisionNotification } from "./content";

export async function sendDecisionNotificationEmail(input: {
  kind: AccessDecision;
  recipientEmail: string;
  recipientName: string;
}): Promise<void> {
  if (!onboardingEnabled(process.env)) {
    throw new Error("DECISION_EMAIL_DISABLED");
  }
  const base = new URL(process.env.BETTER_AUTH_URL ?? "");
  const statusUrl = new URL("/request-access/status", base).toString();
  const message = buildDecisionNotification({
    kind: input.kind,
    applicantName: input.recipientName,
    statusUrl,
  });
  await sendApplicationEmail({
    to: input.recipientEmail,
    subject: message.subject,
    text: message.text,
  });
}
