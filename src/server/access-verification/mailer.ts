import "server-only";

import nodemailer from "nodemailer";

type SendVerificationEmailParams = {
  to: string;
  token: string;
};

export async function sendAccessVerificationEmail({
  to,
  token,
}: SendVerificationEmailParams): Promise<void> {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  ) {
    throw new Error("LOCAL_EMAIL_VERIFICATION_DISABLED");
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT);

  if (
    !["localhost", "127.0.0.1"].includes(smtpHost ?? "") ||
    smtpPort !== 1025
  ) {
    throw new Error("INVALID_LOCAL_SMTP_CONFIGURATION");
  }

  const baseUrl = process.env.BETTER_AUTH_URL;

  if (!baseUrl) {
    throw new Error("BETTER_AUTH_URL_NOT_CONFIGURED");
  }

  const parsedBaseUrl = new URL(baseUrl);

  if (
    parsedBaseUrl.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(parsedBaseUrl.hostname)
  ) {
    throw new Error("INVALID_LOCAL_APPLICATION_URL");
  }

  const verificationUrl = new URL("/request-access/verify", parsedBaseUrl);

  verificationUrl.searchParams.set("token", token);

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    ignoreTLS: true,
  });

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? "no-reply@auvrion.test",
      to,
      subject: "Verifikasi Email Permohonan Akses — Auvrion Biosphere",
      text: [
        "Auvrion Biosphere",
        "",
        "Kami menerima permohonan akses yang menggunakan alamat email ini.",
        "",
        "Untuk memverifikasi alamat email Anda, buka tautan berikut:",
        verificationUrl.toString(),
        "",
        "Tautan berlaku selama 30 menit dan hanya dapat digunakan sekali.",
        "",
        "Jika Anda tidak mengajukan permohonan akses, abaikan email ini.",
        "",
        "Verifikasi email tidak berarti permohonan telah disetujui.",
        "Persetujuan dan aktivasi akun dilakukan melalui proses terpisah.",
      ].join("\n"),
    });
  } finally {
    transporter.close();
  }
}
