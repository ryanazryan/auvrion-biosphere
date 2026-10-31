import "server-only";

import { renderAuvrionEmail } from "@/server/mail/template";
import { sendApplicationEmail } from "@/server/mail/transport";

type SendVerificationEmailParams = { to: string; token: string };

export async function sendAccessVerificationEmail({
  to,
  token,
}: SendVerificationEmailParams): Promise<void> {
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL) throw new Error("BETTER_AUTH_URL_NOT_CONFIGURED");
  const verificationUrl = new URL("/request-access/verify", baseURL);
  verificationUrl.hash = `token=${encodeURIComponent(token)}`;
  const url = verificationUrl.toString();
  const subject = "Verifikasi Email Permohonan Akses — Auvrion Biosphere";
  const paragraphs = [
    "Kami menerima permohonan akses menggunakan alamat email ini.",
    "Verifikasi alamat email Anda untuk melanjutkan proses permohonan. Verifikasi tidak otomatis memberikan akses aplikasi.",
  ];
  const securityNote =
    "Tautan berlaku 30 menit, hanya dapat digunakan sekali. Jika bukan Anda yang mengajukan, abaikan email ini.";
  await sendApplicationEmail({
    to,
    subject,
    text: [
      "Auvrion Biosphere",
      "",
      ...paragraphs,
      "Verifikasi email:",
      url,
      securityNote,
    ].join("\n"),
    html: renderAuvrionEmail({
      title: "Verifikasi alamat email Anda",
      greeting: "Halo,",
      paragraphs,
      action: { label: "Verifikasi Email", url },
      securityNote,
    }),
  });
}
