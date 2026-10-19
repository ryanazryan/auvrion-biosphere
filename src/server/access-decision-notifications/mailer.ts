import "server-only";

import nodemailer from "nodemailer";
import { type AccessDecision, buildDecisionNotification } from "./content";

export async function sendDecisionNotificationEmail(input: {
  kind: AccessDecision;
  recipientEmail: string;
  recipientName: string;
}): Promise<void> {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  ) {
    throw new Error("LOCAL_DECISION_EMAIL_DISABLED");
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT);
  if (
    !["localhost", "127.0.0.1"].includes(smtpHost ?? "") ||
    smtpPort !== 1025
  ) {
    throw new Error("INVALID_LOCAL_SMTP_CONFIGURATION");
  }

  const configuredUrl = process.env.BETTER_AUTH_URL;
  if (!configuredUrl) throw new Error("BETTER_AUTH_URL_NOT_CONFIGURED");
  const base = new URL(configuredUrl);
  if (
    base.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(base.hostname)
  ) {
    throw new Error("INVALID_LOCAL_APPLICATION_URL");
  }

  const statusUrl = new URL("/request-access/status", base).toString();
  const message = buildDecisionNotification({
    kind: input.kind,
    applicantName: input.recipientName,
    statusUrl,
  });

  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    ignoreTLS: true,
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 5000,
  });

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? "no-reply@auvrion.test",
      to: input.recipientEmail,
      subject: message.subject,
      text: message.text,
    });
  } finally {
    transport.close();
  }
}
