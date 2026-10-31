"use client";

import { useState } from "react";

type Notice = { kind: "success" | "warning" | "error"; message: string };

export function DecisionNotificationRetry({
  applicationId,
  kind = "approved",
}: {
  applicationId: string;
  kind?: "approved" | "rejected";
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function retryNotification() {
    if (busy) return;
    setBusy(true);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/admin/access-applications/${encodeURIComponent(applicationId)}/decision-notification`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
        },
      );
      const payload: unknown = await response.json();
      const result = payload && typeof payload === "object" ? payload : null;

      if (response.status === 429) {
        const seconds =
          result &&
          "retryAfterSeconds" in result &&
          typeof result.retryAfterSeconds === "number"
            ? result.retryAfterSeconds
            : 30;
        setNotice({
          kind: "warning",
          message: `Email masih dalam masa tunggu. Coba kembali sekitar ${seconds} detik lagi.`,
        });
        return;
      }

      if (!response.ok) {
        setNotice({
          kind: "error",
          message:
            response.status === 409
              ? "Email sedang dikirim. Periksa kembali setelah beberapa saat."
              : response.status === 401 || response.status === 403
                ? "Sesi Admin atau izin manage_access tidak valid. Silakan masuk kembali."
                : "Belum dapat memeriksa atau mengirim email. Periksa koneksi SMTP/Mailpit.",
        });
        return;
      }

      const delivery = result && "delivery" in result ? result.delivery : null;
      const alreadySent =
        result && "alreadySent" in result ? result.alreadySent === true : false;

      if (delivery === "sent") {
        setNotice({
          kind: "success",
          message: alreadySent
            ? "Pemberitahuan sebelumnya sudah diterima penyedia email. Periksa inbox atau Mailpit; tidak dikirim duplikat."
            : "Pemberitahuan berhasil diteruskan ke layanan email. Periksa inbox atau Mailpit.",
        });
      } else {
        setNotice({
          kind: "warning",
          message:
            "Pengiriman masih gagal atau tertunda. Pastikan Mailpit/SMTP hidup, lalu coba lagi setelah masa tunggu.",
        });
      }
    } catch {
      setNotice({ kind: "error", message: "Tidak dapat menghubungi server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-3.5">
      <p className="text-[13px] font-semibold text-ink">
        {kind === "approved" ? "Email persetujuan" : "Email hasil peninjauan"}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">
        {kind === "approved"
          ? "Setelah disetujui, pemohon mendapat pemberitahuan untuk menunggu penetapan role. Email ini terpisah dari undangan aktivasi."
          : "Pemberitahuan hasil peninjauan dikirim ke alamat email pemohon."}
      </p>
      <button
        type="button"
        onClick={retryNotification}
        disabled={busy}
        aria-busy={busy || undefined}
        className="mt-3 min-h-10 w-full rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-brand transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy
          ? "Memeriksa pengiriman..."
          : "Periksa / Kirim Ulang Pemberitahuan"}
      </button>
      {notice && (
        <p
          role="status"
          className={`mt-3 text-xs leading-5 ${
            notice.kind === "error" ? "text-danger" : "text-muted"
          }`}
        >
          {notice.message}
        </p>
      )}
    </div>
  );
}
