"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Passkey assertion is verified by Better Auth and Auvrion's UV/session-assurance hook. */
export function PasskeyLoginButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      if (!window.isSecureContext || !("PublicKeyCredential" in window)) {
        setError(
          "Passkey membutuhkan HTTPS atau localhost dan browser yang mendukung WebAuthn.",
        );
        return;
      }
      const result = await authClient.signIn.passkey();
      if (result.error || !result.data) {
        setError(
          "Passkey dibatalkan atau tidak dapat diverifikasi. Gunakan kata sandi dan TOTP jika perlu.",
        );
        return;
      }
      // Authorization and MFA assurance are checked by server pages and APIs.
      window.location.replace("/");
    } catch {
      setError(
        "Autentikasi passkey gagal. Silakan coba lagi atau gunakan login alternatif.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="mt-6 border-t border-line pt-5"
      aria-label="Login dengan passkey"
    >
      <button
        type="button"
        onClick={() => void signIn()}
        disabled={loading}
        aria-busy={loading}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-brand bg-brand-50 px-4 text-sm font-semibold text-brand transition-colors hover:bg-[#e1efe7] disabled:opacity-55"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          className="size-5"
        >
          <path d="M12 3a7 7 0 0 0-7 7v2m14 0v-2a7 7 0 0 0-7-7Zm-9 10v2a9 9 0 0 0 18 0v-2M8 11v4a4 4 0 0 0 8 0v-4" />
        </svg>
        {loading ? "Memverifikasi passkey…" : "Masuk dengan Passkey"}
      </button>
      <p className="mt-2 text-center text-[12px] leading-5 text-muted">
        Windows Hello, biometrik, atau PIN perangkat. Kata sandi + TOTP tetap
        tersedia.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-danger-50 p-3 text-[12px] text-danger"
        >
          {error}
        </p>
      )}
    </section>
  );
}
