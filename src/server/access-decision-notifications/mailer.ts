import "server-only";

import { onboardingEnabled } from "@/server/account-activation/onboarding-environment";
import { renderAuvrionEmail } from "@/server/mail/template";
import { sendApplicationEmail } from "@/server/mail/transport";
import { type AccessDecision, buildDecisionNotification } from "./content";

export async function sendDecisionNotificationEmail(input: {
  kind: AccessDecision;
  recipientEmail: string;
  recipientName: string;
}): Promise<void> {
  if (!onboardingEnabled(process.env)) {
    throw new Error("DECISION_EMAIL_DISABLED");
  }
  const base = new URL(process.env.BETTER_AUTH_URL ?? "");
  const statusUrl = new URL("/request-access/status", base).toString();
  const message = buildDecisionNotification({
    kind: input.kind,
    applicantName: input.recipientName,
    statusUrl,
  });
  await sendApplicationEmail({
    to: input.recipientEmail,
    subject: message.subject,
    text: message.text,
    html: renderAuvrionEmail({
      title:
        input.kind === "approved"
          ? "Permohonan akses disetujui"
          : "Hasil peninjauan permohonan",
      greeting: `Halo, ${input.recipientName}.`,
      paragraphs:
        input.kind === "approved"
          ? [
              "Permohonan akses Anda ke Auvrion Biosphere telah disetujui.",
              "Administrator sedang menetapkan peran dan menyiapkan hak akses akun Anda.",
              "Mohon tetap bersiap dan periksa kotak masuk serta folder spam. Anda akan menerima email undangan aktivasi terpisah ketika akun siap.",
              "Anda tidak perlu mengajukan permohonan baru.",
            ]
          : [
              "Permohonan akses Anda belum dapat disetujui setelah proses peninjauan.",
              "Untuk informasi lebih lanjut, silakan menghubungi administrator organisasi.",
            ],
      securityNote:
        "Email ini hanya pemberitahuan hasil peninjauan, bukan akses masuk atau tautan aktivasi akun.",
    }),
  });
}
