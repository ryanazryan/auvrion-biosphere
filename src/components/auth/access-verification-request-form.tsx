"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";

import { AuthHeader } from "./auth-layout";

const inputClass =
  "h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:opacity-60";

export function AccessVerificationRequestForm({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const submitting = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)
    ) {
      setError("Masukkan alamat email yang valid.");
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError("");
    setSubmitted(false);

    try {
      const response = await fetch(
        "/api/access-applications/email-verification/request",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            email: normalizedEmail,
          }),
        },
      );

      if (response.status === 202) {
        setSubmitted(true);
        return;
      }

      setError("Permintaan belum dapat diproses. Coba lagi nanti.");
    } catch {
      setError("Layanan tidak dapat dihubungi. Periksa koneksi Anda.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      {!compact ? (
        <AuthHeader title="Verifikasi email">
          Masukkan alamat email yang digunakan saat mengajukan akses ke Auvrion
          Biosphere.
        </AuthHeader>
      ) : (
        <p className="mb-3 text-[13px] leading-6 text-muted">
          Belum menerima email verifikasi? Masukkan email yang sama untuk
          meminta tautan baru tanpa mengajukan akses ulang.
        </p>
      )}

      {submitted ? (
        <div
          role="status"
          className="rounded-lg border border-brand/20 bg-brand-50 p-4"
        >
          <h2 className="text-sm font-semibold text-ink">
            Permintaan diterima
          </h2>

          <p className="mt-2 text-[13px] leading-6 text-muted">
            Jika permohonan Anda memenuhi persyaratan, tautan verifikasi akan
            dikirim ke alamat email yang dimasukkan.
          </p>

          <p className="mt-2 text-[13px] leading-6 text-muted">
            Periksa inbox dan folder spam. Tautan verifikasi berlaku selama 24
            jam.
          </p>

          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md border border-line-strong px-4 text-[13px] font-medium text-brand hover:bg-bg"
          >
            Tidak masuk? Kirim ulang lagi
          </button>
          <p className="mt-2 text-xs text-muted">
            Tunggu minimal 60 detik sebelum mencoba lagi.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-danger/25 bg-danger-50 p-3 text-[13px] text-danger"
            >
              {error}
            </p>
          ) : null}

          <div>
            <label
              htmlFor="verification-email"
              className="mb-1.5 block text-[13px] font-medium"
            >
              Email
            </label>

            <input
              id="verification-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              maxLength={254}
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@instansi.go.id"
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            aria-busy={busy || undefined}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? "Memproses…" : "Kirim ulang verifikasi"}
          </button>
        </form>
      )}

      {!compact ? (
        <>
          <div className="mt-6 rounded-lg border border-line bg-surface p-3.5 text-[13px] leading-6 text-muted">
            <p>
              Pengiriman email tidak berarti permohonan Anda telah disetujui.
            </p>
            <p className="mt-2">
              Setelah email diverifikasi, administrator masih perlu meninjau
              permohonan Anda.
            </p>
          </div>
          <p className="mt-5 text-center text-[13px] text-muted">
            <Link
              href="/login"
              className="font-medium text-brand hover:underline"
            >
              Kembali ke halaman masuk
            </Link>
          </p>
        </>
      ) : null}
    </>
  );
}
