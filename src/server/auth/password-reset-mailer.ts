import "server-only";

import nodemailer from "nodemailer";
import { localPasswordRecoveryEnabled } from "./password-reset-policy";

/** Local Mailpit only. Production requires an approved mail delivery/security policy. */
export async function sendLocalPasswordResetOtp({
  email,
  otp,
}: {
  email: string;
  otp: string;
}): Promise<void> {
  if (!localPasswordRecoveryEnabled(process.env))
    throw new Error("LOCAL_RECOVERY_DISABLED");
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  if (!["127.0.0.1", "localhost"].includes(host ?? "") || port !== 1025) {
    throw new Error("INVALID_LOCAL_SMTP");
  }
  const base = new URL(process.env.BETTER_AUTH_URL ?? "");
  if (
    base.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(base.hostname)
  ) {
    throw new Error("INVALID_LOCAL_BASE_URL");
  }
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    ignoreTLS: true,
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 5000,
  });
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? "no-reply@auvrion.test",
      to: email,
      subject: "Kode reset kata sandi — Auvrion Biosphere",
      text: [
        "Kode pemulihan kata sandi Auvrion Biosphere:",
        otp,
        "",
        "Berlaku 5 menit dan maksimal 3 percobaan verifikasi.",
        "Jangan berikan kode ini kepada siapapun.",
        "Reset kata sandi tidak mengaktifkan akun, menambah grant, atau melewati MFA.",
        "Jika tidak meminta reset, abaikan email ini.",
      ].join("\n"),
    });
  } finally {
    transporter.close();
  }
}
