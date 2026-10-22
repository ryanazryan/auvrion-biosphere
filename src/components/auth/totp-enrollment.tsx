"use client";

import { type FormEvent, useRef, useState } from "react";
import QRCode from "react-qr-code";

import { authClient } from "@/lib/auth-client";
import { AuthHeader } from "./auth-layout";

type Setup = {
  uri: string;
  codes: string[];
};

const inputClass =
  "h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:opacity-60";

export function TotpEnrollment() {
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !password) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.twoFactor.enable({
        password,
        method: "totp",
      });
      if (
        result.error ||
        !result.data ||
        result.data.method !== "totp" ||
        !result.data.totpURI
      ) {
        setError(
          "Autentikator belum dapat disiapkan. Periksa kata sandi dan status akun.",
        );
        return;
      }
      setSetup({
        uri: result.data.totpURI,
        codes: result.data.backupCodes,
      });
      setPassword("");
    } catch {
      setError("Tidak dapat memulai pengaturan autentikator. Coba lagi.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !/^\d{6}$/.test(code)) {
      setError("Masukkan kode autentikator enam digit.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code,
        trustDevice: false,
      });
      if (result.error || !result.data) {
        setError("Kode salah, kedaluwarsa, atau sementara dibatasi.");
        setCode("");
        return;
      }
      setVerified(true);
      setCode("");
    } catch {
      setError("Verifikasi gagal. Silakan coba kembali.");
      setCode("");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const manualKey = setup
    ? new URL(setup.uri).searchParams.get("secret")
    : null;

  if (finished) {
    return (
      <>
        <AuthHeader title="Autentikator terdaftar">
          Verifikasi dua faktor sudah selesai. Akses operasional masih
          memerlukan aktivasi serta izin server-side yang sah.
        </AuthHeader>
        <a
          className="text-sm font-medium text-brand hover:underline"
          href="/account/activation/finalize"
        >
          Lanjutkan aktivasi / buka aplikasi
        </a>
      </>
    );
  }

  return (
    <div className="space-y-5">
      <AuthHeader title="Siapkan verifikasi dua faktor">
        Lindungi akun dengan aplikasi autentikator. Proses ini belum
        mengaktifkan akses operasional Anda.
      </AuthHeader>

      {!setup ? (
        <form className="space-y-4" onSubmit={begin}>
          <div>
            <label
              htmlFor="enroll-password"
              className="mb-1.5 block text-sm font-medium"
            >
              Konfirmasi kata sandi
            </label>
            <input
              id="enroll-password"
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy || !password}
            className="h-11 w-full rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {busy ? "Menyiapkan…" : "Mulai pengaturan"}
          </button>
        </form>
      ) : !verified ? (
        <>
          <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
            <p className="text-sm font-medium">
              1. Pindai dengan aplikasi autentikator
            </p>
            <div className="mx-auto w-fit rounded-md bg-white p-3">
              <QRCode
                value={setup.uri}
                size={200}
                level="M"
                title="QR konfigurasi autentikator"
              />
            </div>
            <p className="text-xs leading-5 text-muted">
              QR berisi kunci rahasia. Jangan kirim tangkapan layar, unggah,
              atau bagikan kode ini. QR dibuat lokal di browser.
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                Gunakan kunci manual
              </summary>
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium text-muted">
                  Kunci manual autentikator
                </p>

                <p className="break-all rounded-md bg-bg p-2 font-mono text-xs">
                  {manualKey ?? "Kunci tidak tersedia"}
                </p>
              </div>
            </details>
          </div>
          <form className="space-y-3" onSubmit={verify}>
            <label htmlFor="enroll-code" className="block text-sm font-medium">
              2. Masukkan kode enam digit dari autentikator
            </label>
            <input
              id="enroll-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              disabled={busy}
              required
              aria-describedby={error ? "enroll-error" : undefined}
              aria-invalid={Boolean(error)}
              className={`${inputClass} text-center text-xl tracking-widest [font-variant-numeric:tabular-nums]`}
            />
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="h-11 w-full rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {busy ? "Memverifikasi…" : "Verifikasi autentikator"}
            </button>
          </form>
        </>
      ) : (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Simpan kode pemulihan</h2>
          <p className="text-sm leading-6 text-muted">
            Autentikator berhasil diverifikasi. Simpan kode pemulihan satu kali
            ini di tempat yang aman. Setiap kode hanya dapat dipakai sekali.
          </p>
          {setup.codes.length > 0 ? (
            <>
              <ul className="grid grid-cols-1 gap-2 rounded-lg border border-line bg-surface p-4 font-mono text-sm sm:grid-cols-2">
                {setup.codes.map((recovery) => (
                  <li key={recovery} className="break-all">
                    {recovery}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="rounded-md border border-line-strong px-4 py-2 text-sm font-medium hover:bg-bg"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(setup.codes.join("\n"));
                    setCopied(true);
                    setError("");
                  } catch {
                    setCopied(false);
                    setError("Gagal menyalin. Simpan kode secara manual.");
                  }
                }}
              >
                {copied ? "✓ Kode berhasil disalin" : "Salin kode pemulihan"}
              </button>
              {copied && (
                <p role="status" className="text-xs text-brand">
                  Kode tersalin ke clipboard. Simpan di tempat yang aman, jangan
                  dibagikan.
                </p>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={saved}
                  onChange={(event) => setSaved(event.target.checked)}
                />
                Saya telah menyimpan kode pemulihan dengan aman.
              </label>
              <button
                type="button"
                disabled={!saved}
                className="h-11 w-full rounded-md bg-brand px-4 text-sm font-medium text-white disabled:opacity-60"
                onClick={() => {
                  setSetup(null);
                  setFinished(true);
                }}
              >
                Selesai
              </button>
            </>
          ) : (
            <p role="alert" className="text-sm text-danger">
              Kode pemulihan tidak tersedia. Hubungi administrator sebelum
              keluar.
            </p>
          )}
        </section>
      )}

      {error ? (
        <p role="alert" id="enroll-error" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
