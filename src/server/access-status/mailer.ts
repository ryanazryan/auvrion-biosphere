import "server-only";

import { renderAuvrionEmail } from "@/server/mail/template";
import { sendApplicationEmail } from "@/server/mail/transport";

export async function sendApplicantStatusLink(params: {
  to: string;
  token: string;
}): Promise<void> {
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL) throw new Error("BETTER_AUTH_URL_NOT_CONFIGURED");
  const link = new URL("/request-access/status/verify", baseURL);
  link.hash = `token=${encodeURIComponent(params.token)}`;
  const url = link.toString();
  const subject = "Lihat Status Permohonan — Auvrion Biosphere";
  const paragraphs = [
    "Kami menerima permintaan untuk memeriksa status permohonan akses Anda.",
    "Buka tautan di bawah dan klik Lanjutkan untuk memulihkan sesi pemeriksaan status.",
  ];
  const securityNote =
    "Tautan berlaku 15 menit dan hanya dapat digunakan sekali. Tautan ini tidak mengaktifkan akun atau memberikan akses operasional.";
  await sendApplicationEmail({
    to: params.to,
    subject,
    text: [...paragraphs, "Lihat status:", url, securityNote].join("\n\n"),
    html: renderAuvrionEmail({
      title: "Periksa status permohonan",
      greeting: "Halo,",
      paragraphs,
      action: { label: "Periksa Status", url },
      securityNote,
    }),
  });
}
