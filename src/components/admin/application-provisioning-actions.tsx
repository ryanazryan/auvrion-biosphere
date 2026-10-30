"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SelectMenu } from "@/components/ui/SelectMenu";
import type { OperationalRole } from "@/server/account-activation/policy";

type AccessStatus = "pending_activation" | "active" | "disabled" | null;
export function ApplicationProvisioningActions({
  applicationId,
  applicantName,
  accessStatus,
  invitationUsedAt,
  onClose,
}: {
  applicationId: string;
  applicantName: string;
  accessStatus: AccessStatus;
  invitationUsedAt: string | null;
  onClose: () => void;
}) {
  const [role, setRole] = useState<OperationalRole>("operator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const router = useRouter();
  const action =
    accessStatus === null
      ? "issue"
      : accessStatus === "pending_activation" && !invitationUsedAt
        ? "resend"
        : null;
  async function submit() {
    if (!action || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/access-applications/${encodeURIComponent(applicationId)}/provision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify(
            action === "issue" ? { action, role } : { action },
          ),
        },
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        const code =
          result && typeof result === "object" && "error" in result
            ? result.error
            : null;
        setError(
          code === "NOT_REISSUABLE" || code === "CREDENTIAL_ALREADY_SET"
            ? "Undangan tidak dapat dikirim ulang: akun mungkin berasal dari seed development atau password sudah dibuat. Jangan memodifikasi grant secara manual; gunakan akun onboarding baru."
            : code === "ROLE_GRANT_REQUIRED"
              ? "Akun belum memiliki role grant valid. Periksa data provisioning."
              : response.status === 429
                ? "Tunggu 60 detik sebelum mengirim ulang undangan."
                : response.status === 401 || response.status === 403
                  ? "Sesi admin dengan MFA dan izin manage_access diperlukan."
                  : "Permintaan ditolak. Periksa apakah akun sudah diproses dan kondisinya masih valid.",
        );
        return;
      }
      const delivery =
        result && typeof result === "object" && "delivery" in result
          ? result.delivery
          : null;
      setMessage(
        delivery === "failed"
          ? "Akun tercatat, tetapi SMTP gagal. Setelah Mailpit pulih dan cooldown lewat, kirim ulang undangan."
          : "Undangan aktivasi sudah dikirim ke Mailpit.",
      );
      onClose();
      router.refresh();
    } catch {
      setError("Layanan tidak tersedia. Coba lagi.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-6 border-t border-line pt-6"
      aria-label="Provisioning akun"
    >
      <h3 className="text-sm font-semibold">Provisioning & Aktivasi</h3>
      <p className="mt-2 text-xs leading-5 text-muted">
        Permohonan telah lolos peninjauan. Pilih peran, lalu kirim undangan
        aktivasi. Akun baru aktif setelah pengguna menyelesaikan pengaturan.
      </p>
      {accessStatus === null && (
        <div className="mt-4">
          <label htmlFor="provision-role" className="block text-sm font-medium">
            Role untuk {applicantName}
          </label>
          <SelectMenu
            id="provision-role"
            label={`Role untuk ${applicantName}`}
            value={role}
            disabled={busy}
            onChange={setRole}
            className="mt-2"
            options={[
              { value: "operator", label: "Operator" },
              { value: "supervisor", label: "Supervisor" },
              { value: "ranger", label: "Ranger" },
            ]}
          />
        </div>
      )}
      {accessStatus === "active" && (
        <p className="mt-3 text-sm text-brand">Akun sudah aktif.</p>
      )}
      {accessStatus === "disabled" && (
        <p className="mt-3 text-sm text-danger">Akun dinonaktifkan.</p>
      )}
      {accessStatus === "pending_activation" && invitationUsedAt && (
        <p className="mt-3 text-sm text-muted">
          Password dibuat. Penyelesaian TOTP.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-3 rounded bg-danger-50 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mt-3 rounded border border-line p-3 text-sm"
        >
          {message}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={submit}
          disabled={busy || Boolean(message)}
          className="mt-4 w-full rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy
            ? "Memproses..."
            : action === "issue"
              ? "Buat Akun & Kirim Undangan"
              : "Kirim Ulang Undangan"}
        </button>
      )}
      {message && (
        <button
          type="button"
          onClick={onClose}
          className="mt-3 text-sm font-medium text-brand"
        >
          Tutup dan muat ulang daftar
        </button>
      )}
    </section>
  );
}
