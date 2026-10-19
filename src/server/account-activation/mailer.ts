import "server-only";
import nodemailer from "nodemailer";
export async function sendActivationInvitation(input: {
  email: string;
  name: string;
  token: string;
}): Promise<void> {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  )
    throw new Error("LOCAL_MAIL_DISABLED");
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  if (!["localhost", "127.0.0.1"].includes(host ?? "") || port !== 1025)
    throw new Error("INVALID_LOCAL_SMTP");
  const base = new URL(process.env.BETTER_AUTH_URL ?? "");
  if (
    base.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(base.hostname)
  )
    throw new Error("INVALID_BASE_URL");
  const inviteUrl = new URL("/activate", base);
  // Fragment is not sent to Next.js server or HTTP access logs.
  inviteUrl.hash = `token=${encodeURIComponent(input.token)}`;
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
      to: input.email,
      subject: "Undangan Aktivasi Akun — Auvrion Biosphere",
      text: [
        "Auvrion Biosphere",
        "",
        `Halo, ${input.name}.`,
        "Administrator telah menyiapkan akun dan hak akses Anda.",
        "Buat kata sandi dengan membuka tautan sekali pakai berikut:",
        inviteUrl.toString(),
        "",
        "Tautan berlaku 30 menit. Undangan yang lebih baru membatalkan undangan lama.",
        "Kemudian masuk dan selesaikan verifikasi dua faktor (TOTP).",
        "Akun tidak aktif sampai persyaratan keamanan selesai.",
        "Jika tidak mengajukan akun, abaikan pesan ini.",
      ].join("\n"),
    });
  } finally {
    transport.close();
  }
}
