"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { AuthHeader } from "./auth-layout";

type VerificationState = "idle" | "loading" | "success" | "invalid" | "error";

type Props = {
  token: string | null;
};

export function AccessEmailVerificationForm({ token }: Props) {
  const [state, setState] = useState<VerificationState>(
    token ? "idle" : "invalid",
  );

  const submitting = useRef(false);

  async function handleVerify() {
    if (!token || submitting.current) {
      return;
    }

    submitting.current = true;
    setState("loading");

    try {
      const response = await fetch(
        "/api/access-applications/email-verification/confirm",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ token }),
        },
      );

      if (response.ok) {
        // Remove the sensitive token from the address bar
        // without triggering another page navigation.
        window.history.replaceState(
          window.history.state,
          "",
          "/request-access/verify",
        );

        setState("success");
        return;
      }

      if (response.status === 400) {
        setState("invalid");
        return;
      }

      setState("error");
    } catch {
      setState("error");
    } finally {
      submitting.current = false;
    }
  }

  if (state === "success") {
    return (
      <>
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-2xl text-brand">
          ✓
        </div>

        <AuthHeader title="Email berhasil diverifikasi">
          Alamat email Anda telah berhasil diverifikasi.
        </AuthHeader>

        <div className="rounded-lg border border-brand/20 bg-brand-50 p-4">
          <p className="text-sm font-medium text-ink">Verifikasi berhasil</p>

          <p className="mt-2 text-[13px] leading-6 text-muted">
            Permohonan akses Anda sekarang menunggu peninjauan administrator.
          </p>
        </div>

        <div className="mt-6 rounded-lg border border-line p-4 text-[13px] leading-6 text-muted">
          Verifikasi email belum berarti akun Anda aktif. Administrator masih
          perlu menyetujui permohonan dan memberikan izin yang sesuai.
        </div>

        <Link
          href="/login"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-bg"
        >
          Kembali ke halaman masuk
        </Link>
      </>
    );
  }

  if (state === "invalid") {
    return (
      <>
        <AuthHeader title="Tautan tidak valid">
          Tautan verifikasi tidak ditemukan, sudah kedaluwarsa, atau telah
          digunakan sebelumnya.
        </AuthHeader>

        <div
          role="alert"
          className="rounded-lg border border-warn/20 bg-warn-50 p-4 text-[13px] leading-6 text-warn"
        >
          Permintaan ini tidak dapat diverifikasi. Silakan minta tautan baru
          jika permohonan Anda masih menunggu verifikasi email.
        </div>

        <Link
          href="/request-access/resend"
          referrerPolicy="no-referrer"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover"
        >
          Minta tautan baru
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeader title="Konfirmasi email">
        Selesaikan verifikasi alamat email Anda untuk melanjutkan proses
        permohonan akses.
      </AuthHeader>

      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="text-sm font-medium text-ink">
          Verifikasi permohonan akses
        </p>

        <p className="mt-2 text-[13px] leading-6 text-muted">
          Dengan mengonfirmasi email, Anda menyatakan bahwa alamat email ini
          dapat Anda akses.
        </p>

        <p className="mt-2 text-[13px] leading-6 text-muted">
          Setelah berhasil, permohonan akan diteruskan untuk peninjauan
          administrator.
        </p>
      </div>

      {state === "error" ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-danger/20 bg-danger-50 p-3 text-[13px] text-danger"
        >
          Verifikasi belum dapat diproses. Silakan coba kembali.
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleVerify}
        disabled={state === "loading"}
        aria-busy={state === "loading"}
        className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "loading" ? "Memverifikasi…" : "Konfirmasi email"}
      </button>

      <p className="mt-5 text-center text-[13px] text-muted">
        Tidak meminta akses?{" "}
        <Link
          href="/login"
          referrerPolicy="no-referrer"
          className="font-medium text-brand hover:underline"
        >
          Kembali ke halaman masuk
        </Link>
      </p>
    </>
  );
}
