"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ApplicationStatus =
  | "submitted"
  | "email_verified"
  | "approved"
  | "rejected";

type Decision = "approved" | "rejected";

type Props = {
  applicationId: string;
  applicantName: string;
  status: ApplicationStatus;
  onClose: () => void;
};

function getErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    INVALID_ORIGIN: "Permintaan ditolak karena origin tidak valid.",
    INVALID_REQUEST: "Data permintaan tidak valid.",
    INVALID_DECISION: "Keputusan tidak valid.",
    INVALID_APPLICATION_ID: "ID permohonan tidak valid.",
    REJECTION_REASON_REQUIRED: "Alasan penolakan minimal 5 karakter.",
    REASON_TOO_LONG: "Catatan tidak boleh melebihi 500 karakter.",
    APPLICATION_NOT_REVIEWABLE:
      "Permohonan sudah diproses atau belum memenuhi syarat.",
    ACCESS_REVOKED: "Hak akses administrator telah dicabut.",
    ORG_NOT_CONFIGURED: "Organisasi development belum tersedia.",
    DECISION_FAILED: "Gagal menyimpan keputusan. Coba lagi.",
    NOT_FOUND: "Endpoint keputusan tidak tersedia.",
  };

  return messages[code] ?? "Permintaan gagal diproses.";
}

export function ApplicationDecisionActions({
  applicationId,
  applicantName,
  status,
  onClose,
}: Props) {
  const router = useRouter();

  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reviewable = status === "email_verified";

  const reasonValid =
    reason.trim().length <= 500 &&
    (decision !== "rejected" || reason.trim().length >= 5);

  function chooseDecision(next: Decision) {
    if (submitting || !reviewable) return;

    setDecision(next);
    setReason("");
    setError(null);
  }

  function cancelDecision() {
    if (submitting) return;

    setDecision(null);
    setReason("");
    setError(null);
  }

  async function submitDecision() {
    if (!reviewable || !decision || !reasonValid || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/access-applications/${encodeURIComponent(applicationId)}/decision`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            decision,
            reason: reason.trim(),
          }),
        },
      );

      const payload: unknown = await response.json();

      if (!response.ok) {
        let code = "UNKNOWN_ERROR";

        if (
          payload !== null &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
        ) {
          code = payload.error;
        }

        if (response.status === 401) {
          setError("Sesi sudah berakhir. Silakan login kembali.");
        } else if (response.status === 403) {
          setError(
            "Akses ditolak. Pastikan sesi admin memiliki MFA dan izin manage_access yang valid.",
          );
        } else {
          setError(getErrorMessage(code));
        }

        return;
      }

      setDecision(null);
      onClose();
      router.refresh();
    } catch {
      setError(
        "Tidak dapat menghubungi server. Periksa koneksi dan coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!reviewable) {
    const message: Record<
      Exclude<ApplicationStatus, "email_verified">,
      string
    > = {
      submitted:
        "Email pemohon belum diverifikasi. Keputusan belum dapat diberikan.",
      approved:
        "Permohonan sudah disetujui. Aktivasi akun dilakukan melalui proses terpisah.",
      rejected: "Permohonan sudah ditolak dan tidak dapat diproses ulang.",
    };

    return (
      <div className="mt-auto pt-8">
        <div className="rounded-lg border border-line bg-bg p-4">
          <p className="text-sm text-muted">{message[status]}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-bg"
        >
          Tutup
        </button>
      </div>
    );
  }

  return (
    <div className="mt-auto pt-8">
      <div className="border-t border-line pt-6">
        {!decision ? (
          <>
            <h3 className="text-sm font-semibold text-ink">
              Keputusan Administrator
            </h3>

            <p className="mt-1 text-xs leading-5 text-muted">
              Pastikan identitas dan verifikasi email pemohon sudah diperiksa
              sebelum memberikan keputusan.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => chooseDecision("rejected")}
                disabled={submitting}
                className="rounded-md border border-danger px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Tolak
              </button>

              <button
                type="button"
                onClick={() => chooseDecision("approved")}
                disabled={submitting}
                className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Setujui
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-line bg-bg p-4">
            <h3 className="text-base font-semibold text-ink">
              {decision === "approved"
                ? "Konfirmasi Persetujuan"
                : "Konfirmasi Penolakan"}
            </h3>

            <p className="mt-2 text-sm leading-6 text-muted">
              {decision === "approved"
                ? `Anda akan menyetujui permohonan akses ${applicantName}. Persetujuan ini tidak langsung mengaktifkan akun pengguna.`
                : `Anda akan menolak permohonan akses ${applicantName}. Alasan penolakan wajib dicatat.`}
            </p>

            <div className="mt-4">
              <label
                htmlFor="application-decision-reason"
                className="block text-sm font-medium text-ink"
              >
                {decision === "rejected"
                  ? "Alasan penolakan"
                  : "Catatan persetujuan (opsional)"}
              </label>

              <textarea
                id="application-decision-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError(null);
                }}
                disabled={submitting}
                maxLength={500}
                rows={4}
                placeholder={
                  decision === "rejected"
                    ? "Jelaskan alasan permohonan ditolak..."
                    : "Tambahkan catatan untuk audit..."
                }
                aria-required={decision === "rejected"}
                aria-invalid={!reasonValid}
                className="mt-2 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none disabled:opacity-60"
              />

              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                <span>
                  {decision === "rejected"
                    ? "Minimal 5 karakter"
                    : "Catatan tidak wajib"}
                </span>

                <span className="tabular-nums">{reason.length}/500</span>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-md bg-danger-50 p-3 text-sm text-danger"
              >
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={cancelDecision}
                disabled={submitting}
                className="flex-1 rounded-md border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-bg disabled:opacity-50"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={submitDecision}
                disabled={submitting || !reasonValid}
                className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                  decision === "approved"
                    ? "bg-brand hover:opacity-90"
                    : "bg-danger hover:opacity-90"
                }`}
              >
                {submitting
                  ? "Memproses..."
                  : decision === "approved"
                    ? "Konfirmasi Setujui"
                    : "Konfirmasi Tolak"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
