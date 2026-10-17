"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { AuthHeader } from "./auth-layout";

export function AccessStatusRecoveryForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/access-applications/status/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email: email.trim() }),
      });
      if (response.status === 202) setSent(true);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AuthHeader title="Cek status permohonan">
        Masukkan email pengajuan untuk mendapatkan tautan akses status yang
        aman.
      </AuthHeader>
      {sent ? (
        <div
          role="status"
          className="rounded-lg border border-brand/20 bg-brand-50 p-4 text-sm leading-6 text-ink"
        >
          Jika email tersebut memiliki permohonan, tautan status akan dikirim.
          Periksa Mailpit untuk development, termasuk kemungkinan jeda
          pengiriman. Tautan berlaku 15 menit.
        </div>
      ) : (
        <form onSubmit={requestLink} className="space-y-4">
          <div>
            <label
              htmlFor="status-email"
              className="mb-1.5 block text-[13px] font-medium"
            >
              Email pengajuan
            </label>
            <input
              id="status-email"
              type="email"
              required
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              className="h-11 w-full rounded-md border border-line-strong bg-white px-3 text-sm focus:border-brand focus:outline-none"
              placeholder="email@contoh.com"
            />
          </div>
          {failed && (
            <p
              role="alert"
              className="rounded-md bg-danger-50 p-3 text-sm text-danger"
            >
              Permintaan gagal dikirim. Periksa koneksi dan coba lagi.
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Mengirim..." : "Kirim tautan status"}
          </button>
        </form>
      )}
      <p className="mt-5 text-center text-[13px] text-muted">
        Belum pernah mengajukan?{" "}
        <Link
          href="/request-access"
          className="font-medium text-brand hover:underline"
        >
          Ajukan akses
        </Link>
      </p>
    </>
  );
}
