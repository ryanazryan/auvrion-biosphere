"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { AuthHeader } from "./auth-layout";

export function TwoFactorForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!/^\d{6}$/.test(code)) {
      setError("Masukkan enam digit kode autentikator.");
      return;
    }

    submitting.current = true;
    setLoading(true);
    setError("");

    try {
      const result = await authClient.twoFactor.verifyTotp({
        code,
        trustDevice: false,
      });

      if (result.error) {
        setCode("");
        setError("Kode tidak valid, kedaluwarsa, atau sementara dibatasi.");
        return;
      }

      // Temporary, non-operational landing page. Never use this navigation
      // as authorization or proof of MFA for protected server routes.
      window.location.assign("/");
    } catch {
      setCode("");
      setError("Verifikasi tidak tersedia. Silakan coba lagi.");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <>
      <AuthHeader title="Verifikasi Dua Faktor">
        Masukkan kode enam digit dari aplikasi autentikator Anda.
      </AuthHeader>

      <form className="space-y-4" onSubmit={verify} noValidate>
        <div>
          <label
            htmlFor="totp-code"
            className="mb-1.5 block text-[13px] font-medium"
          >
            Kode Autentikator
          </label>
          <input
            id="totp-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              setError("");
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "totp-error" : "totp-hint"}
            placeholder="000000"
            disabled={loading}
            required
            className="tnum h-12 w-full rounded-md border border-line-strong bg-surface px-3 text-center text-xl tracking-[0.3em] text-fg focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:opacity-60"
          />
          <p id="totp-hint" className="mt-1.5 text-xs text-muted">
            Kode berganti secara berkala. Periksa waktu perangkat jika tidak
            sesuai.
          </p>
          {error ? (
            <p
              id="totp-error"
              role="alert"
              className="mt-1.5 text-xs text-danger"
            >
              {error}
            </p>
          ) : null}
        </div>

        <button
          disabled={loading}
          type="submit"
          aria-busy={loading || undefined}
          className="h-10 w-full rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-55"
        >
          {loading ? "Memverifikasi…" : "Verifikasi kode"}
        </button>
      </form>

      <Link
        href="/login"
        className="mt-6 inline-block text-[13px] text-muted hover:text-fg"
      >
        Kembali ke halaman masuk
      </Link>
    </>
  );
}
