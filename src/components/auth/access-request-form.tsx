"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import type { AccessRequestErrors } from "@/lib/access-request";
import { validateAccessRequest } from "@/lib/access-request";
import { AuthHeader } from "./auth-layout";

const inputClass =
  "h-10 w-full rounded-md border bg-surface px-3 text-sm text-fg placeholder:text-muted/70 transition-colors duration-150 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60";

function InfoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
      className="mt-0.5 size-3.5 shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1.5 text-xs text-danger">
      {message}
    </p>
  ) : null;
}

export function AccessRequestForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<AccessRequestErrors>({});
  const [busy, setBusy] = useState(false);
  const [serviceError, setServiceError] = useState(false);
  const submitting = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    setServiceError(false);
    const result = validateAccessRequest({ name, email });
    if (!result.ok) {
      setErrors(result.errors);
      if (result.errors.name) nameRef.current?.focus();
      else if (result.errors.email) emailRef.current?.focus();
      return;
    }

    submitting.current = true;
    setBusy(true);
    setErrors({});

    try {
      const response = await fetch("/api/access-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.value),
        cache: "no-store",
        credentials: "same-origin",
      });

      if (response.status === 202) {
        window.location.assign("/request-access/submitted");
        return;
      }

      if (response.status === 400) {
        // Client and server run the same validation function.
        setErrors({
          email: "Periksa kembali data yang dimasukkan.",
        });
        emailRef.current?.focus();
        return;
      }

      setServiceError(true);
    } catch {
      setServiceError(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <AuthHeader title="Ajukan akses">
        Isi data berikut untuk meminta akses ke Auvrion Biosphere. Permohonan
        akan ditinjau oleh administrator organisasi.
      </AuthHeader>

      <form onSubmit={submit} noValidate className="space-y-4" aria-busy={busy}>
        {serviceError ? (
          <div
            role="alert"
            className="flex gap-2.5 rounded-md border border-danger/25 bg-danger-50 px-3 py-2.5 text-[13px] leading-5 text-fg"
          >
            <InfoIcon />
            <div>
              <p className="font-medium">Layanan tidak tersedia</p>
              <p className="text-muted">
                Permohonan belum dapat dikirim. Coba lagi beberapa saat lagi.
              </p>
            </div>
          </div>
        ) : null}

        <div>
          <label
            htmlFor="access-name"
            className="mb-1.5 block text-[13px] font-medium"
          >
            Nama lengkap
          </label>
          <input
            id="access-name"
            ref={nameRef}
            autoComplete="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (errors.name)
                setErrors((current) => ({ ...current, name: undefined }));
            }}
            aria-invalid={Boolean(errors.name) || undefined}
            aria-describedby={errors.name ? "access-name-error" : undefined}
            className={`${inputClass} ${errors.name ? "border-danger" : "border-line-strong"}`}
            disabled={busy}
            maxLength={120}
          />
          <FieldError id="access-name-error" message={errors.name} />
        </div>

        <div>
          <label
            htmlFor="access-email"
            className="mb-1.5 block text-[13px] font-medium"
          >
            Email
          </label>
          <input
            id="access-email"
            ref={emailRef}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (errors.email)
                setErrors((current) => ({ ...current, email: undefined }));
            }}
            aria-invalid={Boolean(errors.email) || undefined}
            aria-describedby={errors.email ? "access-email-error" : undefined}
            className={`${inputClass} ${errors.email ? "border-danger" : "border-line-strong"}`}
            disabled={busy}
            maxLength={254}
          />
          <FieldError id="access-email-error" message={errors.email} />
        </div>

        <button
          type="submit"
          aria-busy={busy}
          disabled={busy}
          className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-55"
        >
          {busy ? "Mengirim…" : "Kirim permohonan"}
        </button>
      </form>

      <ul className="mt-5 space-y-2 rounded-lg border border-line bg-surface p-3.5 text-[13px] leading-5 text-muted">
        <li className="flex gap-2">
          <InfoIcon />
          Pengajuan akses tidak langsung membuat akun aktif.
        </li>
        <li className="flex gap-2">
          <InfoIcon />
          Peran dan izin diberikan oleh administrator.
        </li>
      </ul>

      <p className="mt-5 text-center text-[13px] text-muted">
        Sudah memiliki akun?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Masuk
        </Link>
      </p>
    </>
  );
}
