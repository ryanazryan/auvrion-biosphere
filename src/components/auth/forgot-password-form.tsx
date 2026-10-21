"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { AuthHeader } from "./auth-layout";

const field =
  "h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:opacity-60";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"request" | "verify" | "done">("request");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const normalized = email.trim().toLowerCase();
    if (
      normalized.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ) {
      setMessage("Masukkan alamat email yang valid.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      // Do not expose account existence: the same next step is shown for all addresses.
      await authClient.emailOtp.requestPasswordReset({ email: normalized });
      setEmail(normalized);
      setStep("verify");
      setMessage(
        "Jika akun terdaftar, kode telah dikirim. Periksa kotak masuk atau Mailpit lokal.",
      );
    } catch {
      setMessage(
        "Permintaan belum dapat diproses. Silakan coba lagi beberapa saat.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    if (!/^\d{8}$/.test(code)) {
      setMessage("Masukkan kode 8 digit dari email.");
      return;
    }
    if (
      password.length < 16 ||
      password.length > 128 ||
      password.trim().length < 16
    ) {
      setMessage("Kata sandi baru harus 16–128 karakter.");
      return;
    }
    if (password !== confirm) {
      setMessage("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.emailOtp.resetPassword({
        email,
        otp: code,
        password,
      });
      if (result.error) {
        setMessage(
          "Kode salah/kedaluwarsa atau reset ditolak. Periksa kode dan kebijakan password.",
        );
        return;
      }
      setCode("");
      setPassword("");
      setConfirm("");
      setStep("done");
    } catch {
      setMessage("Tidak dapat memulihkan kata sandi. Coba lagi.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  if (step === "done") {
    return (
      <>
        <AuthHeader title="Kata sandi diperbarui">
          Silakan masuk kembali. Verifikasi TOTP, status akun dan izin
          organisasi tetap diwajibkan.
        </AuthHeader>
        <Link
          href="/login"
          className="inline-flex h-11 items-center rounded-md bg-brand px-5 text-sm font-semibold text-white"
        >
          Kembali ke login
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeader title="Lupa kata sandi?">
        Pulihkan kata sandi melalui kode sekali pakai yang dikirim ke email
        akun. Proses ini tidak melewati persetujuan Admin atau MFA.
      </AuthHeader>
      {message && (
        <p
          role="status"
          className="mb-4 rounded-md border border-line bg-brand-50 px-3 py-2 text-[13px] leading-5"
        >
          {message}
        </p>
      )}
      {step === "request" ? (
        <form className="space-y-4" onSubmit={requestCode}>
          <label
            htmlFor="recovery-email"
            className="block text-[13px] font-medium"
          >
            Email akun
          </label>
          <input
            id="recovery-email"
            type="email"
            autoComplete="email"
            required
            className={field}
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-md bg-brand px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Mengirim…" : "Kirim kode pemulihan"}
          </button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={resetPassword}>
          <p className="text-xs text-muted">Email: {email}</p>
          <div className="space-y-1.5">
            <label
              htmlFor="recovery-code"
              className="block text-[13px] font-medium"
            >
              Kode verifikasi (8 digit)
            </label>
            <input
              id="recovery-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{8}"
              maxLength={8}
              className={field}
              value={code}
              disabled={busy}
              required
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 8))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="recovery-password"
              className="block text-[13px] font-medium"
            >
              Kata sandi baru
            </label>
            <input
              id="recovery-password"
              type="password"
              autoComplete="new-password"
              minLength={16}
              maxLength={128}
              className={field}
              value={password}
              disabled={busy}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="recovery-confirm"
              className="block text-[13px] font-medium"
            >
              Konfirmasi kata sandi
            </label>
            <input
              id="recovery-confirm"
              type="password"
              autoComplete="new-password"
              maxLength={128}
              className={field}
              value={confirm}
              disabled={busy}
              required
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-md bg-brand px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Memperbarui…" : "Verifikasi kode & perbarui password"}
          </button>
          <button
            type="button"
            disabled={busy}
            className="block text-sm font-medium text-brand hover:underline"
            onClick={() => {
              setStep("request");
              setCode("");
              setMessage("");
            }}
          >
            Kembali untuk meminta kode baru
          </button>
        </form>
      )}
      <Link
        href="/login"
        className="mt-6 inline-block text-[13px] font-medium text-brand hover:underline"
      >
        Kembali ke login
      </Link>
    </>
  );
}
