import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { Resend } from "resend";

type Message = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/** Read local, real Auvrion assets, never depend on a live website. */
async function inlineImages(html: string | undefined) {
  if (!html) return [];
  const images = [
    {
      cid: "auvrion-logo",
      filename: "auvrion-biosphere-wordmark.png",
      path: "public/branding/auvrion-biosphere-wordmark.png",
    },
    {
      cid: "auvrion-hero",
      filename: "auvrion-email-hero.png",
      path: "public/branding/auvrion-email-hero.png",
    },
  ].filter((image) => html.includes(`cid:${image.cid}`));
  return Promise.all(
    images.map(async (image) => ({
      ...image,
      content: (await readFile(join(process.cwd(), image.path))).toString(
        "base64",
      ),
    })),
  );
}

export async function sendApplicationEmail(message: Message): Promise<void> {
  const attachments = await inlineImages(message.html);
  if (process.env.NODE_ENV === "development") {
    if (process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES") {
      throw new Error("LOCAL_MAIL_DISABLED");
    }
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT);
    const baseURL = new URL(process.env.BETTER_AUTH_URL ?? "");
    if (
      !["localhost", "127.0.0.1"].includes(host ?? "") ||
      port !== 1025 ||
      baseURL.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(baseURL.hostname)
    ) {
      throw new Error("INVALID_LOCAL_MAIL_CONFIGURATION");
    }
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: false,
      ignoreTLS: true,
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 5000,
    });
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? "no-reply@auvrion.test",
        ...message,
        attachments: attachments.map((image) => ({
          filename: image.filename,
          cid: image.cid,
          content: Buffer.from(image.content, "base64"),
        })),
      });
    } finally {
      transport.close();
    }
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    throw new Error("MAIL_ENVIRONMENT_NOT_SUPPORTED");
  }
  const baseURL = new URL(process.env.BETTER_AUTH_URL ?? "");
  if (
    baseURL.protocol !== "https:" ||
    baseURL.hostname !== "auvrionbiosphere.com" ||
    baseURL.port !== ""
  ) {
    throw new Error("INVALID_PRODUCTION_MAIL_BASE_URL");
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY_REQUIRED");
  const from = process.env.RESEND_FROM_EMAIL;
  if (from !== "no-reply@auvrionbiosphere.com") {
    throw new Error("INVALID_RESEND_FROM_EMAIL");
  }

  const { data, error } = await new Resend(key).emails.send({
    from: `Auvrion Biosphere <${from}>`,
    to: [message.to],
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    attachments: attachments.map((image) => ({
      filename: image.filename,
      content: image.content,
      contentId: image.cid,
    })),
  });
  if (error || !data?.id) {
    // Never log recipients, email contents, OTPs, tokens, or provider errors.
    throw new Error("PRODUCTION_EMAIL_DELIVERY_FAILED");
  }
}
