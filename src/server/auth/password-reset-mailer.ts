import "server-only";

import { renderAuvrionEmail } from "@/server/mail/template";
import { sendApplicationEmail } from "@/server/mail/transport";
import { passwordRecoveryEnabled } from "./password-reset-policy";

export async function sendLocalPasswordResetOtp({
  email,
  otp,
}: {
  email: string;
  otp: string;
}): Promise<void> {
  if (!passwordRecoveryEnabled(process.env)) {
    throw new Error("PASSWORD_RECOVERY_DISABLED");
  }
  const subject = "Kode reset kata sandi — Auvrion Biosphere";
  const paragraphs = [
    "Kami menerima permintaan untuk mengatur ulang kata sandi akun Auvrion Biosphere.",
    "Masukkan kode berikut pada halaman reset kata sandi.",
  ];
  const securityNote =
    "Kode berlaku 5 menit dan maksimal 3 percobaan. Jangan bagikan kode ini. Reset kata sandi tidak mengaktifkan akun, menambah hak akses, atau melewati MFA.";
  await sendApplicationEmail({
    to: email,
    subject,
    text: [...paragraphs, `Kode: ${otp}`, securityNote].join("\n\n"),
    html: renderAuvrionEmail({
      title: "Reset kata sandi",
      greeting: "Halo,",
      paragraphs,
      code: otp,
      securityNote,
    }),
  });
}
