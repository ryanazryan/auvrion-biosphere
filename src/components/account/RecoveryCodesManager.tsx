"use client";

import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Codes are kept only in component memory until explicitly hidden/unmounted. */
export function RecoveryCodesManager() {
  const [open, setOpen] = useState(false);
  const [totp, setTotp] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function regenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !/^\d{6}$/.test(totp) || !password) return;
    if (
      !window.confirm(
        "Kode pemulihan lama akan langsung tidak berlaku. Buat kode baru?",
      )
    )
      return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const verified = await fetch("/api/auth/passkey-step-up", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totp }),
      });
      if (!verified.ok)
        throw new Error("TOTP tidak valid atau sesi MFA telah berakhir.");
      const result = await authClient.twoFactor.generateBackupCodes({
        password,
      });
      if (
        result.error ||
        !Array.isArray(result.data?.backupCodes) ||
        !result.data.backupCodes.length
      ) {
        throw new Error("Kode baru gagal dibuat. Pastikan kata sandi benar.");
      }
      setCodes(result.data.backupCodes);
      setOpen(false);
      setMessage(
        "Kode baru dibuat; kode lama telah dibatalkan. Simpan sebelum menutup bagian ini.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Regenerasi gagal.");
    } finally {
      setTotp("");
      setPassword("");
      setPending(false);
    }
  }

  async function copyCodes() {
    if (!codes.length) return;
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard tidak didukung browser ini.");
      await navigator.clipboard.writeText(codes.join("\n"));
      setMessage(
        "Perintah salin berhasil dijalankan. Uji paste sebelum memilih Sembunyikan kode.",
      );
      setError("");
    } catch {
      setError(
        "Tidak berhasil menyalin otomatis. Pilih semua teks di kotak kode lalu salin dengan Ctrl+C.",
      );
    }
    // IMPORTANT: Never hide codes in response to a copy attempt.
  }

  return (
    <div className="mb-3 space-y-3 rounded-xl border border-line bg-white p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-ink">
        Buat ulang kode pemulihan
      </h3>
      <p className="text-xs leading-5 text-muted">
        Verifikasi ulang TOTP dan kata sandi. Kode baru hanya dapat dilihat
        selama halaman ini belum ditutup atau dimuat ulang.
      </p>
      {codes.length ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-brand">
            Simpan kode ini sekarang. Menekan Salin tidak akan menutup panel.
          </p>
          <label
            htmlFor="recovery-new-codes"
            className="block text-xs font-medium text-muted"
          >
            Kode pemulihan baru — dapat dipilih dan disalin manual
          </label>
          <textarea
            id="recovery-new-codes"
            readOnly
            spellCheck={false}
            rows={Math.min(12, codes.length + 1)}
            value={codes.join("\n")}
            onFocus={(event) => event.currentTarget.select()}
            className="block w-full resize-y rounded-lg border border-line bg-bg p-3 font-mono text-sm text-ink"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyCodes()}
              className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white"
            >
              Salin seluruh kode
            </button>
            <button
              type="button"
              onClick={() => {
                setCodes([]);
                setMessage("");
                setError("");
              }}
              className="rounded-lg border border-line-strong px-4 py-2 text-xs font-semibold"
            >
              Selesai, sembunyikan kode
            </button>
          </div>
        </div>
      ) : open ? (
        <form
          onSubmit={(event) => void regenerate(event)}
          className="space-y-3"
        >
          <label
            className="block text-xs font-medium"
            htmlFor="recovery-rotate-totp"
          >
            Kode autentikator (TOTP)
          </label>
          <input
            id="recovery-rotate-totp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={totp}
            required
            disabled={pending}
            onChange={(e) =>
              setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            className="block w-full rounded-md border border-line-strong p-2 text-sm"
          />
          <label
            className="block text-xs font-medium"
            htmlFor="recovery-rotate-password"
          >
            Kata sandi akun
          </label>
          <input
            id="recovery-rotate-password"
            type="password"
            autoComplete="current-password"
            required
            disabled={pending}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block w-full rounded-md border border-line-strong p-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || totp.length !== 6 || !password}
              className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Memverifikasi…" : "Verifikasi dan buat kode baru"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setPassword("");
                setTotp("");
              }}
              className="rounded-lg border border-line-strong px-4 py-2 text-xs"
            >
              Batal
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setError("");
            setMessage("");
          }}
          className="rounded-lg border border-line-strong px-4 py-2 text-xs font-semibold text-brand"
        >
          Buat ulang kode pemulihan
        </button>
      )}
      {message && (
        <p role="status" className="text-xs text-brand">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
