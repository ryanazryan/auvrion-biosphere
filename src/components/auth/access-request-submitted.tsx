import Link from "next/link";
import { AccessApplicationProgress } from "./access-application-progress";
import { AccessVerificationRequestForm } from "./access-verification-request-form";

export function AccessRequestSubmitted() {
  return (
    <>
      <div className="mb-5 grid size-10 place-items-center rounded-lg bg-brand-50 text-brand">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </div>

      <h1 className="text-2xl font-semibold tracking-[-0.015em]">
        Permohonan akses diterima
      </h1>

      <p className="mt-2 text-sm leading-6 text-muted">
        Jika memenuhi persyaratan, permohonan Anda telah dicatat. Periksa email
        untuk tautan verifikasi; jika belum diterima, gunakan tombol pengiriman
        ulang.
      </p>

      <AccessApplicationProgress status="submitted" />

      <div className="mt-7 flex flex-col gap-4">
        <AccessVerificationRequestForm compact />

        <Link
          href="/demo"
          className="text-center text-sm font-medium text-brand hover:underline"
        >
          Eksplorasi Demo tanpa login
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-10 w-full items-center justify-center rounded-md px-4 py-2 text-center text-[13px] font-medium text-muted transition-colors hover:bg-brand-50 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Kembali ke halaman masuk
        </Link>
      </div>
    </>
  );
}
