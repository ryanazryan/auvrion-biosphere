"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { AuthHeader } from "./auth-layout";

type VerificationMode = "totp" | "recovery";

const SLOTS = ["one", "two", "three", "four", "five", "six"] as const;

export function TwoFactorForm() {
  const [mode, setMode] = useState<VerificationMode>("totp");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const lastAutoSubmittedCode = useRef<string | null>(null);

  function switchMode() {
    if (submitting.current) return;

    setMode((current) => (current === "totp" ? "recovery" : "totp"));
    setCode("");
    setRecoveryCode("");
    setFocused(false);
    setError("");
    lastAutoSubmittedCode.current = null;
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current) return;

    if (mode === "totp" && !/^\d{6}$/.test(code)) {
      setError("Masukkan enam digit kode autentikator.");
      return;
    }

    if (mode === "recovery" && !recoveryCode.trim()) {
      setError("Masukkan kode pemulihan Anda.");
      return;
    }

    submitting.current = true;
    setLoading(true);
    setError("");

    try {
      const result =
        mode === "totp"
          ? await authClient.twoFactor.verifyTotp({
              code,
              trustDevice: false,
            })
          : await authClient.twoFactor.verifyBackupCode({
              code: recoveryCode.trim(),
              trustDevice: false,
              disableSession: false,
            });

      if (result.error) {
        setCode("");
        setRecoveryCode("");
        setError("Kode tidak valid, sudah digunakan, atau sementara dibatasi.");
        return;
      }

      // Server tetap menentukan apakah akun memiliki akses workspace.
      window.location.assign("/");
    } catch {
      setCode("");
      setRecoveryCode("");
      setError("Verifikasi tidak tersedia. Silakan coba kembali.");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  // Automatically verify a completed six-digit TOTP.
  useEffect(() => {
    if (mode !== "totp") {
      lastAutoSubmittedCode.current = null;
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      lastAutoSubmittedCode.current = null;
      return;
    }

    if (submitting.current || loading) return;

    // Prevent duplicate submissions from React re-renders.
    if (lastAutoSubmittedCode.current === code) return;

    lastAutoSubmittedCode.current = code;

    // Reuse the same submit handler as the manual button.
    formRef.current?.requestSubmit();
  }, [code, mode, loading]);

  const activeSlot = Math.min(code.length, SLOTS.length - 1);

  return (
    <>
      <AuthHeader
        title={
          mode === "totp" ? "Verifikasi Dua Faktor" : "Gunakan Kode Pemulihan"
        }
      >
        {mode === "totp"
          ? "Masukkan enam digit kode dari aplikasi autentikator Anda."
          : "Masukkan salah satu kode pemulihan yang disimpan saat mengaktifkan autentikator."}
      </AuthHeader>

      <form ref={formRef} className="space-y-5" onSubmit={verify} noValidate>
        {mode === "totp" ? (
          <div>
            <label
              htmlFor="totp-code"
              className="mb-2 block text-[13px] font-medium text-fg"
            >
              Kode Autentikator
            </label>

            <div className="relative">
              <div
                aria-hidden="true"
                className="grid grid-cols-6 gap-2 sm:gap-3"
              >
                {SLOTS.map((slot, index) => {
                  const digit = code[index];

                  const active = focused && !loading && index === activeSlot;

                  return (
                    <div
                      key={slot}
                      className={`flex h-12 min-w-0 items-center justify-center rounded-lg border bg-surface text-xl font-semibold tabular-nums transition-colors sm:h-14 sm:text-2xl ${
                        active
                          ? "border-ink ring-1 ring-ink"
                          : error
                            ? "border-danger"
                            : "border-line-strong"
                      }`}
                    >
                      <span className={digit ? "text-ink" : "text-muted/35"}>
                        {digit || "0"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Single accessible input for keyboard, paste, and autofill. */}
              <input
                id="totp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                disabled={loading}
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "two-factor-error" : "totp-hint"}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
              />
            </div>

            <p id="totp-hint" className="mt-2 text-xs leading-5 text-muted">
              Kode berganti secara berkala. Periksa waktu perangkat jika tidak
              sesuai.
            </p>
          </div>
        ) : (
          <div>
            <label
              htmlFor="recovery-code"
              className="mb-2 block text-[13px] font-medium text-fg"
            >
              Kode Pemulihan
            </label>

            <input
              id="recovery-code"
              type="text"
              value={recoveryCode}
              disabled={loading}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "two-factor-error" : "recovery-hint"}
              onChange={(event) => {
                setRecoveryCode(event.target.value);
                setError("");
              }}
              placeholder="Masukkan kode pemulihan"
              className="h-12 w-full rounded-lg border border-line-strong bg-surface px-3 font-mono text-sm text-fg outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-60"
            />

            <p id="recovery-hint" className="mt-2 text-xs leading-5 text-muted">
              Setiap kode pemulihan hanya dapat dipakai sekali.
            </p>
          </div>
        )}

        {error && (
          <p
            id="two-factor-error"
            role="alert"
            className="text-[13px] text-danger"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={
            loading ||
            (mode === "totp" ? code.length !== 6 : !recoveryCode.trim())
          }
          aria-busy={loading || undefined}
          className="h-11 w-full rounded-md bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loading
            ? "Memverifikasi…"
            : mode === "totp"
              ? "Verifikasi kode"
              : "Verifikasi kode pemulihan"}
        </button>

        <button
          type="button"
          disabled={loading}
          onClick={switchMode}
          className="w-full rounded-md px-2 py-2 text-center text-[13px] font-medium text-brand transition-colors hover:bg-brand-50 disabled:opacity-55"
        >
          {mode === "totp" ? (
            <span className="inline-flex flex-col items-center gap-1 sm:inline">
              <span>Tidak dapat mengakses autentikator?</span>
              <span className="font-semibold sm:ml-1">
                Gunakan kode pemulihan
              </span>
            </span>
          ) : (
            "Kembali ke kode autentikator"
          )}
        </button>
      </form>

      <Link
        href="/login"
        className="mt-5 inline-block text-[13px] text-muted hover:text-fg"
      >
        Kembali ke halaman masuk
      </Link>
    </>
  );
}
