import Link from "next/link";

const steps = [
  "Permohonan dikirim",
  "Verifikasi email",
  "Peninjauan administrator",
  "Aktivasi akun",
];

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
        Jika data memenuhi persyaratan, permohonan Anda akan diproses lebih
        lanjut.
      </p>
      <ol className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface text-sm">
        {steps.map((step, index) => (
          <li
            key={step}
            aria-current={index === 0 ? "step" : undefined}
            className="flex items-center gap-3 px-3.5 py-2.5"
          >
            <span
              className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-medium ${
                index === 0
                  ? "border-2 border-brand text-brand"
                  : "border border-line-strong text-muted"
              }`}
            >
              {index + 1}
            </span>
            <span className={index === 0 ? "text-fg" : "text-muted"}>
              {step}
            </span>
            <span className="ml-auto text-xs text-muted">
              {index === 0 ? "Saat ini" : "Berikutnya"}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-7 flex flex-col gap-4">
        <Link
          href="/request-access/resend"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-brand px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Kirim email verifikasi
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
