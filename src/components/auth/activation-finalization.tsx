"use client";
import { useRef, useState } from "react";
import { AuthHeader } from "./auth-layout";
export function ActivationFinalization() {
  const [result, setResult] = useState<"pending" | "active">("pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function complete() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/activation/complete", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        setError(
          "Prasyarat belum lengkap. Periksa verifikasi TOTP, status akun, dan izin administrator.",
        );
        return;
      }
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === "object" &&
        "outcome" in body &&
        body.outcome === "ACTIVATED"
      )
        setResult("active");
      else window.location.assign("/");
    } catch {
      setError("Aktivasi belum dapat diselesaikan.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (result === "active")
    return (
      <>
        <AuthHeader title="Akun berhasil diaktifkan">
          Sesi sebelumnya dicabut. Masuk kembali menggunakan password dan TOTP.
        </AuthHeader>
        <a
          href="/login"
          className="inline-block rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white"
        >
          Masuk kembali
        </a>
      </>
    );
  return (
    <>
      <AuthHeader title="Selesaikan aktivasi">
        Server akan memeriksa approval, role grant, password, dan TOTP sebelum
        akun aktif.
      </AuthHeader>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={complete}
        disabled={busy}
        className="h-11 w-full rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Memeriksa..." : "Selesaikan aktivasi"}
      </button>
    </>
  );
}
