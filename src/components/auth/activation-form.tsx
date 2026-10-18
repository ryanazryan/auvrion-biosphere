"use client";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AuthHeader } from "./auth-layout";

export function ActivationForm() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const locked = useRef(false);
  const tokenCaptured = useRef(false);

  useEffect(() => {
    // Prevent repeated token parsing in React Strict Mode.
    if (tokenCaptured.current) return;
    tokenCaptured.current = true;

    const candidate = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );

    setToken(
      candidate && /^[A-Za-z0-9_-]{43}$/.test(candidate) ? candidate : "",
    );

    // Remove the activation token from the address bar.
    window.history.replaceState(window.history.state, "", "/activate");
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || locked.current) return;
    if (
      password.length < 16 ||
      password.length > 128 ||
      password.trim().length < 16
    ) {
      setError("Kata sandi minimal 16 dan maksimal 128 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi kata sandi berbeda.");
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/activation/consume", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      setPassword("");
      setConfirm("");
      if (!response.ok) {
        setError(
          "Undangan tidak valid, telah digunakan, kedaluwarsa, atau belum dapat diproses. Mintalah undangan baru dari administrator.",
        );
      } else {
        setToken("");
        setDone(true);
      }
    } catch {
      setError(
        "Layanan aktivasi tidak tersedia. Coba lagi melalui undangan baru.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  if (done)
    return (
      <>
        <AuthHeader title="Kata sandi berhasil dibuat">
          Masuk dengan password Anda lalu daftarkan autentikator TOTP. Akun
          belum aktif.
        </AuthHeader>
        <Link
          href="/login"
          className="block rounded-md bg-brand px-4 py-3 text-center text-sm font-semibold text-white"
        >
          Masuk dan siapkan TOTP
        </Link>
      </>
    );
  if (token === "")
    return (
      <>
        <AuthHeader title="Undangan tidak valid">
          Minta tautan aktivasi baru dari administrator.
        </AuthHeader>
        <Link href="/login" className="text-sm font-medium text-brand">
          Kembali ke login
        </Link>
      </>
    );

  return (
    <>
      <AuthHeader title="Aktivasi akun">
        Siapkan kata sandi baru. Aktivasi selesai setelah Anda mendaftarkan
        TOTP.
      </AuthHeader>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="activation-password"
            className="block text-sm font-medium"
          >
            Kata sandi baru
          </label>
          <input
            id="activation-password"
            type="password"
            autoComplete="new-password"
            minLength={16}
            maxLength={128}
            value={password}
            disabled={busy || token === null}
            required
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-sm"
          />
          <p className="mt-1 text-xs text-muted">
            Minimal 16 karakter; jangan gunakan ulang kata sandi akun lain.
          </p>
        </div>
        <div>
          <label
            htmlFor="activation-confirm"
            className="block text-sm font-medium"
          >
            Konfirmasi kata sandi
          </label>
          <input
            id="activation-confirm"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            value={confirm}
            disabled={busy || token === null}
            required
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-sm"
          />
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-md bg-danger-50 p-3 text-sm text-danger"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || token === null || !password || !confirm}
          className="h-11 w-full rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Memproses..." : "Simpan kata sandi"}
        </button>
      </form>
    </>
  );
}
