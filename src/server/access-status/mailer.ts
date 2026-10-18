import "server-only";

import nodemailer from "nodemailer";

export async function sendApplicantStatusLink(params: {
  to: string;
  token: string;
}): Promise<void> {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  )
    throw new Error("LOCAL_STATUS_EMAIL_DISABLED");

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT);
  if (
    !["localhost", "127.0.0.1"].includes(smtpHost ?? "") ||
    smtpPort !== 1025
  ) {
    throw new Error("INVALID_LOCAL_SMTP_CONFIGURATION");
  }

  const baseUrl = process.env.BETTER_AUTH_URL;
  if (!baseUrl) throw new Error("BETTER_AUTH_URL_NOT_CONFIGURED");
  const base = new URL(baseUrl);
  if (
    base.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(base.hostname)
  ) {
    throw new Error("INVALID_LOCAL_APPLICATION_URL");
  }

  const link = new URL("/request-access/status/verify", base);
  // Avoid exposing recovery bearer token in HTTP request target.
  link.hash = `token=${encodeURIComponent(params.token)}`;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    ignoreTLS: true,
  });
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? "no-reply@auvrion.test",
      to: params.to,
      subject: "Lihat Status Permohonan — Auvrion Biosphere",
      text: [
        "Auvrion Biosphere",
        "",
        "Kami menerima permintaan untuk melihat status permohonan akses Anda.",
        "Buka tautan berikut dan klik 'Lanjutkan' untuk memulihkan sesi status:",
        link.toString(),
        "",
        "Tautan berlaku 15 menit dan hanya dapat digunakan sekali.",
        "Jika bukan Anda yang meminta, abaikan email ini.",
        "Tautan ini tidak mengaktifkan akun atau memberikan akses operasional.",
      ].join("\n"),
    });
  } finally {
    transporter.close();
  }
}
