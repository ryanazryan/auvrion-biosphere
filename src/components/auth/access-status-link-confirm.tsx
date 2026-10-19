"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AuthHeader } from "./auth-layout";

export function AccessStatusLinkConfirm({ token }: { token: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [tokenLoaded, setTokenLoaded] = useState(false);
  // React Strict Mode can replay effects after the fragment was sanitized.
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    const candidate = fragment ?? token;
    setRecoveryToken(
      candidate && /^[A-Za-z0-9_-]{43}$/.test(candidate) ? candidate : null,
    );
    setTokenLoaded(true);
    if (fragment !== null || token !== null) {
      window.history.replaceState(
        window.history.state,
        "",
        "/request-access/status/verify",
      );
    }
  }, [token]);

  async function confirm() {
    if (!recoveryToken || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access-applications/status/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ token: recoveryToken }),
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
      {!tokenLoaded ? (
        <p className="text-sm text-muted">Memeriksa tautan…</p>
      ) : !recoveryToken ? (
        <p role="alert" className="rounded-lg bg-warn-50 p-4 text-sm text-warn">
          Tautan tidak lengkap, sudah digunakan, atau tidak valid. Minta tautan
          baru.
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
