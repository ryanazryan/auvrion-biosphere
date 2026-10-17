"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { AuthHeader } from "./auth-layout";

export function AccessStatusLinkConfirm({ token }: { token: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function confirm() {
    if (!token || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access-applications/status/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        setError(
          response.status === 400
            ? "Tautan sudah digunakan atau kedaluwarsa."
            : "Tidak dapat mengonfirmasi tautan saat ini.",
        );
        return;
      }
      window.history.replaceState(
        window.history.state,
        "",
        "/request-access/status/verify",
      );
      window.location.replace("/request-access/status");
    } catch {
      setError("Koneksi tidak tersedia. Coba lagi.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <AuthHeader title="Pulihkan status permohonan">
        Konfirmasi tautan yang dikirim ke email Anda untuk membuka perkembangan
        permohonan.
      </AuthHeader>
      {!token ? (
        <p role="alert" className="rounded-lg bg-warn-50 p-4 text-sm text-warn">
          Tautan tidak lengkap.
        </p>
      ) : (
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="h-11 w-full rounded-md bg-brand px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Memeriksa..." : "Lanjutkan ke status"}
        </button>
      )}
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-danger-50 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <Link
        href="/request-access/status"
        className="mt-5 block text-center text-sm text-brand hover:underline"
      >
        Minta tautan baru
      </Link>
    </>
  );
}
