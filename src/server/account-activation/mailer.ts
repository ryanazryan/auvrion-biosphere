import "server-only";

import { renderAuvrionEmail } from "@/server/mail/template";
import { sendApplicationEmail } from "@/server/mail/transport";

export async function sendActivationInvitation(input: {
  email: string;
  name: string;
  token: string;
}): Promise<void> {
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL) throw new Error("BETTER_AUTH_URL_NOT_CONFIGURED");
  const inviteUrl = new URL("/activate", baseURL);
  inviteUrl.hash = `token=${encodeURIComponent(input.token)}`;
  const url = inviteUrl.toString();
  const subject = "Undangan Aktivasi Akun — Auvrion Biosphere";
  const paragraphs = [
    "Administrator telah menyiapkan akun dan hak akses Anda.",
    "Gunakan tautan di bawah untuk membuat kata sandi, kemudian masuk dan selesaikan verifikasi dua faktor (TOTP).",
  ];
  const securityNote =
    "Tautan berlaku 30 menit dan hanya dapat digunakan sekali. Undangan yang lebih baru membatalkan undangan lama. Akun tidak aktif sampai persyaratan keamanan selesai.";
  await sendApplicationEmail({
    to: input.email,
    subject,
    text: [
      `Halo, ${input.name}.`,
      ...paragraphs,
      "Aktivasi:",
      url,
      securityNote,
    ].join("\n\n"),
    html: renderAuvrionEmail({
      title: "Aktivasi akun Auvrion Biosphere",
      greeting: `Halo, ${input.name}.`,
      paragraphs,
      action: { label: "Aktivasi Akun", url },
      securityNote,
    }),
  });
}
