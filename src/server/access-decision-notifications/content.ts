export type AccessDecision = "approved" | "rejected";

export function buildDecisionNotification(input: {
  kind: AccessDecision;
  applicantName: string;
  statusUrl: string;
}): { subject: string; text: string } {
  const approved = input.kind === "approved";
  const subject = approved
    ? "Permohonan Akses Disetujui — Auvrion Biosphere"
    : "Pemberitahuan Permohonan Akses — Auvrion Biosphere";

  const description = approved
    ? [
        "Permohonan akses Anda telah disetujui oleh administrator.",
        "Permohonan sudah lolos peninjauan. Saat ini administrator sedang menetapkan peran dan menyiapkan hak akses akun Anda.",
        "Mohon tetap bersiap dan pantau kotak masuk serta folder spam email Anda. Undangan aktivasi akan dikirim melalui email terpisah setelah akun siap.",
        "Anda belum dapat masuk dan tidak perlu mengajukan permohonan ulang.",
      ]
    : [
        "Setelah peninjauan, permohonan akses Anda belum dapat disetujui.",
        "Jika membutuhkan penjelasan lebih lanjut, hubungi administrator organisasi.",
      ];

  return {
    subject,
    text: [
      "Auvrion Biosphere",
      "",
      `Halo, ${input.applicantName}.`,
      "",
      ...description,
      "",
      "Anda dapat memeriksa perkembangan permohonan melalui halaman berikut:",
      input.statusUrl,
      "",
      "Untuk melihat status pribadi, Anda harus menggunakan sesi yang masih valid atau meminta tautan pemulihan melalui email.",
      "",
      "Email ini hanya pemberitahuan dan tidak memberikan akses login atau aktivasi akun.",
      "",
      "Tim Auvrion Biosphere",
    ].join("\n"),
  };
}
