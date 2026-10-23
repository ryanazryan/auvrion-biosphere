"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import * as I from "@/figma-operator/components/icons";
import { authClient } from "@/lib/auth-client";

type Device = {
  id: string;
  name: string | null;
  createdAt: string | null;
  deviceType: string | null;
  backedUp: boolean;
  transports: string | null;
};
type Notice = { kind: "success" | "error"; text: string };
type Props = {
  initialPasskeys: Device[];
  recentMfa: boolean;
  signInEnabled: boolean;
};

function passkeyType(device: Device) {
  if (device.deviceType === "multiDevice") return "Dapat disinkronkan";
  if (device.deviceType === "singleDevice") return "Perangkat tunggal";
  return "Passkey WebAuthn";
}

function registrationDate(iso: string | null) {
  if (!iso) return "Tanggal tidak tersedia";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Tanggal tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function PasskeyManager({
  initialPasskeys,
  recentMfa,
  signInEnabled,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [requiresStepUp, setRequiresStepUp] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const canEdit = recentMfa && !requiresStepUp;

  function beginEnrollment() {
    if (busy) return;
    setNotice(null);
    setEnrolling(true);
    if (!canEdit) setStepUpOpen(true);
  }

  async function verifyTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !/^\d{6}$/.test(totp)) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/auth/passkey-step-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ code: totp }),
      });
      setTotp("");
      if (!response.ok) {
        setNotice({
          kind: "error",
          text: "Verifikasi gagal. Periksa kode TOTP.",
        });
        return;
      }
      setRequiresStepUp(false);
      setStepUpOpen(false);
      setNotice({ kind: "success", text: "Verifikasi berhasil." });
      router.refresh();
    } catch {
      setNotice({
        kind: "error",
        text: "Verifikasi tidak tersedia. Coba lagi.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canEdit) return;
    setBusy(true);
    setNotice(null);
    try {
      if (!window.isSecureContext || !("PublicKeyCredential" in window)) {
        setNotice({
          kind: "error",
          text: "Passkey memerlukan localhost/HTTPS dan browser yang mendukung WebAuthn.",
        });
        return;
      }
      const result = await authClient.passkey.addPasskey({
        name: name.trim().slice(0, 80) || "Perangkat pribadi",
      });
      if (result.error) {
        if (result.error.status === 403) {
          setRequiresStepUp(true);
          setStepUpOpen(true);
        }
        setNotice({
          kind: "error",
          text: "Pendaftaran gagal atau dibatalkan.",
        });
        return;
      }
      setName("");
      setEnrolling(false);
      setNotice({ kind: "success", text: "Passkey berhasil didaftarkan." });
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: "Passkey gagal didaftarkan." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy || !canEdit) {
      setStepUpOpen(true);
      return;
    }
    if (!window.confirm("Hapus Passkey perangkat ini?")) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await authClient.passkey.deletePasskey({ id });
      if (response.error) {
        if (response.error.status === 403) {
          setRequiresStepUp(true);
          setStepUpOpen(true);
        }
        setNotice({ kind: "error", text: "Passkey gagal dihapus." });
        return;
      }
      setNotice({ kind: "success", text: "Passkey berhasil dihapus." });
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: "Passkey gagal dihapus." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-line bg-white p-5 shadow-[0_12px_36px_-28px_rgba(16,53,35,0.28)] sm:p-6 xl:overflow-y-auto"
      aria-labelledby="security-passkey-heading"
    >
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand"
          >
            <I.Lock className="size-5" />
          </span>
          <h2
            id="security-passkey-heading"
            className="text-[17px] font-bold text-ink"
          >
            Passkey
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1.5 text-[11px] font-semibold text-brand">
          {initialPasskeys.length > 0
            ? `${initialPasskeys.length} perangkat`
            : "Opsional"}
        </span>
      </div>

      <p className="mt-3 text-xs text-muted">
        {signInEnabled
          ? "Login Passkey tersedia sebagai pilihan di halaman masuk."
          : "Pendaftaran tersedia. Login Passkey masih dinonaktifkan; gunakan password + TOTP."}
      </p>

      <div className="mt-5 shrink-0">
        {enrolling && canEdit ? (
          <form
            onSubmit={(event) => void register(event)}
            className="rounded-xl border border-line bg-[#f4faf6] p-4"
          >
            <label
              htmlFor="passkey-device-name"
              className="text-xs font-semibold text-ink"
            >
              Nama perangkat
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="passkey-device-name"
                autoComplete="off"
                maxLength={80}
                disabled={busy}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Windows Hello / Security Key"
                className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-white px-3 text-[13px]"
              />
              <button
                type="submit"
                disabled={busy}
                className="h-10 rounded-lg bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {busy ? "Mendaftarkan…" : "Daftarkan"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEnrolling(false)}
                className="h-10 rounded-lg border border-line px-3 text-xs font-medium text-muted"
              >
                Batal
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={beginEnrollment}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            <I.Plus className="size-4" />
            {initialPasskeys.length === 0
              ? "Aktifkan Passkey"
              : "Tambah perangkat"}
          </button>
        )}
      </div>

      {stepUpOpen && !canEdit && (
        <form
          onSubmit={(event) => void verifyTotp(event)}
          className="mt-3 shrink-0 rounded-xl border border-line bg-[#f4faf6] p-3.5"
        >
          <label
            htmlFor="passkey-reverify"
            className="block text-xs font-semibold text-ink"
          >
            Verifikasi TOTP
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="passkey-reverify"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              maxLength={6}
              value={totp}
              disabled={busy}
              required
              onChange={(event) =>
                setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-white px-3 text-sm tracking-widest"
              placeholder="6 digit kode"
            />
            <button
              type="submit"
              disabled={busy || totp.length !== 6}
              className="h-10 rounded-lg bg-brand px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Memverifikasi…" : "Verifikasi"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setStepUpOpen(false);
                setEnrolling(false);
                setTotp("");
              }}
              className="h-10 rounded-lg border border-line px-3 text-xs"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`mt-3 shrink-0 rounded-lg px-3 py-2 text-xs ${notice.kind === "error" ? "bg-danger-50 text-danger" : "bg-brand-50 text-brand"}`}
        >
          {notice.text}
        </p>
      )}

      <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-line pt-4">
        <h3 className="shrink-0 text-[14px] font-bold text-ink">
          Perangkat terdaftar
        </h3>
        {initialPasskeys.length === 0 ? (
          <div className="mt-3 grid min-h-22 flex-1 place-items-center rounded-xl border border-dashed border-line bg-[#fbfdfc] p-4">
            <p className="text-center text-xs text-muted">
              Belum ada perangkat.
            </p>
          </div>
        ) : (
          <ul className="mt-3 min-h-0 space-y-2 overflow-y-auto xl:flex-1">
            {initialPasskeys.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {item.name?.trim() || "Perangkat pribadi"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {passkeyType(item)} · Didaftarkan{" "}
                    {registrationDate(item.createdAt)}
                  </p>
                  {item.backedUp && (
                    <p className="mt-1 text-[11px] text-brand">
                      Dicadangkan oleh penyedia Passkey
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(item.id)}
                  className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
                >
                  {canEdit ? "Hapus" : "Verifikasi untuk hapus"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
