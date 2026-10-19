"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { AuthHeader } from "./auth-layout";

const inputClass =
  "h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-muted/70 transition-colors duration-150 hover:border-muted/50 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError("Masukkan email dan kata sandi.");
      return;
    }

    submitting.current = true;
    setLoading(true);
    setError("");

    try {
      const result = await authClient.signIn.email({
        email: normalizedEmail,
        password,
      });

      if (result.error) {
        setError("Tidak dapat masuk. Periksa kredensial dan status akun Anda.");
        setPassword("");
        return;
      }

      // Better Auth's twoFactorClient handles MFA-enabled accounts.
      // This check makes redirect explicit if a response includes the flag.
      if (
        result.data &&
        "twoFactorRedirect" in result.data &&
        result.data.twoFactorRedirect === true
      ) {
        window.location.assign("/two-factor");
        return;
      }

      // Without enrollment, password auth yields a limited session.
      // The server route performs a separate approval/activation eligibility check.
      window.location.assign("/account/security/enroll");
    } catch {
      setError("Layanan masuk belum tersedia. Coba lagi nanti.");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <>
      <AuthHeader title="Masuk">
        Gunakan akun yang telah disetujui oleh administrator Auvrion Biosphere.
      </AuthHeader>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-danger/25 bg-danger-50 px-3 py-2.5 text-[13px] leading-5 text-danger"
          >
            {error}
          </p>
        ) : null}

        <div>
          <label
            htmlFor="login-email"
            className="mb-1.5 block text-[13px] font-medium"
          >
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nama@instansi.go.id"
            className={inputClass}
            disabled={loading}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="login-password" className="text-[13px] font-medium">
              Kata Sandi
            </label>
            <span className="text-xs text-muted">
              Pemulihan melalui administrator
            </span>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={visible ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${inputClass} pr-20`}
              disabled={loading}
            />
            <button
              type="button"
              aria-label={
                visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
              }
              aria-pressed={visible}
              onClick={() => setVisible((current) => !current)}
              className="absolute inset-y-1 right-1 rounded px-2 text-xs font-medium text-muted hover:bg-bg hover:text-fg"
            >
              {visible ? "Sembunyikan" : "Tampilkan"}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          aria-busy={loading || undefined}
          className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loading ? "Memeriksa…" : "Masuk"}
        </button>
      </form>

      <p className="mt-8 border-t border-line pt-5 text-[13px] leading-6 text-muted">
        Belum memiliki akses?{" "}
        <Link
          href="/request-access"
          className="font-medium text-brand transition-colors hover:text-brand-hover hover:underline"
        >
          Ajukan akses
        </Link>
        . Peran operasional diberikan secara eksplisit oleh administrator, bukan
        dipilih sendiri.
      </p>
    </>
  );
}
