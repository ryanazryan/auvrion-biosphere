"use client";

import { type ReactNode, useEffect, useState } from "react";
import {
  ApiError,
  DOMAIN,
  type Domain,
  QUALITY,
  type Quality,
} from "../../observations";
import * as I from "../icons";
import { Alert, cx } from "../ui";

export const Mono = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => <span className={className}>{children}</span>;

/** Domain is a data category: neutral text + glyph, never styled like a status. */
export function DomainLabel({ d }: { d: Domain }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-fg">
      {d === "biodiversity" ? (
        <I.Leaf className="size-3.5 text-accent" />
      ) : (
        <I.Gauge className="size-3.5 text-ink/70" />
      )}
      {DOMAIN[d].label}
    </span>
  );
}

/** Review quality: outlined marker with glyph + text, so meaning never depends on color alone. */
export function QualityBadge({ q }: { q: Quality }) {
  const c = {
    unreviewed: "border-line-strong text-muted",
    valid: "border-brand/40 text-brand",
    suspect: "border-warn/45 text-warn",
    invalid: "border-danger/45 text-danger",
  }[q];
  const mark = {
    unreviewed: (
      <span
        aria-hidden="true"
        className="size-2 rounded-full border border-current"
      />
    ),
    valid: <I.Check className="size-3" />,
    suspect: <I.Alert className="size-3" />,
    invalid: <I.X className="size-3" />,
  }[q];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border bg-surface px-1.5 py-px text-xs font-medium",
        c,
      )}
      title={QUALITY[q].desc}
    >
      {mark}
      {QUALITY[q].label}
    </span>
  );
}

export const PageTitle = ({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-[25px] leading-8 font-semibold tracking-[-0.015em] text-ink">
        {title}
      </h1>
      {sub && (
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{sub}</p>
      )}
    </div>
    {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
  </div>
);

export const Panel = ({
  title,
  aside,
  children,
  className,
  flush,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) => (
  <section
    className={cx("rounded-md border border-line bg-surface", className)}
  >
    {title && (
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {aside}
      </div>
    )}
    <div className={flush ? "" : "px-4 py-3"}>{children}</div>
  </section>
);

export const KV = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="grid gap-0.5 border-b border-line py-2.5 last:border-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-baseline sm:gap-4">
    <dt className="text-[13px] font-medium text-muted">{k}</dt>
    <dd className="min-w-0 text-sm break-words">{children}</dd>
  </div>
);

export const Unknown = ({ children }: { children: ReactNode }) => (
  <span className="text-muted italic">{children}</span>
);

type QState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; error: ApiError };
/** Minimal async loader; re-runs when deps, the review scenario, or stored records change. */
export function useQuery<T>(load: () => Promise<T>) {
  const [st, setSt] = useState<QState<T>>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    // retryToken is deliberately read to make explicit retries re-run the request.
    void retryToken;
    let active = true;
    setSt({ status: "loading" });
    load().then(
      (data) => {
        if (active) setSt({ status: "ok", data });
      },
      (error) => {
        if (active)
          setSt({
            status: "error",
            error:
              error instanceof ApiError ? error : new ApiError(500, "UNKNOWN"),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [load, retryToken]);

  return { ...st, retry: () => setRetryToken((token) => token + 1) };
}

export function ErrorState({
  error,
  retry,
}: {
  error: ApiError;
  retry?: () => void;
}) {
  if (error.code === "MFA_ASSURANCE_REQUIRED")
    return (
      <Alert tone="warn" title="Verifikasi MFA diperlukan">
        Sesi ini belum memiliki jaminan autentikasi dua langkah, sehingga server
        tidak mengembalikan data observasi.{" "}
        <a
          href="/login"
          className="font-medium text-brand underline underline-offset-2"
        >
          Masuk ulang dan verifikasi MFA
        </a>
        .
      </Alert>
    );
  if (error.status === 401)
    return (
      <Alert tone="warn" title="Sesi berakhir">
        Sesi tidak berlaku.{" "}
        <a href="/login" className="font-medium text-brand underline">
          Masuk kembali
        </a>{" "}
        untuk melanjutkan.
      </Alert>
    );
  if (error.status === 403)
    return (
      <Alert tone="danger" title="Tidak ada akses ke organisasi ini">
        Akun tidak memiliki izin yang diperlukan untuk organisasi ini, sehingga
        server menolak permintaan (403). Hubungi administrator organisasi bila
        ini keliru.
      </Alert>
    );
  if (error.status === 404)
    return (
      <Alert tone="info" title="Observasi tidak ditemukan">
        Rekaman ini tidak ada atau berada di luar organisasi yang Anda akses.
      </Alert>
    );
  return (
    <div
      className="rounded-md border border-danger/25 bg-danger-50 px-4 py-3 text-[13px]"
      role="alert"
    >
      <p className="font-medium">Layanan observasi tidak tersedia</p>
      <p className="mt-0.5 text-muted">
        Tidak dapat memuat data (HTTP {error.status}). Periksa koneksi atau coba
        kembali.
      </p>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-2 rounded text-[13px] font-medium text-brand underline underline-offset-2"
        >
          Coba lagi
        </button>
      )}
    </div>
  );
}

export const LoadingRows = ({
  rows = 5,
  label = "Memuat observasi",
}: {
  rows?: number;
  label?: string;
}) => (
  <div role="status" aria-label={label} className="divide-y divide-line">
    {[
      "row-a",
      "row-b",
      "row-c",
      "row-d",
      "row-e",
      "row-f",
      "row-g",
      "row-h",
      "row-i",
      "row-j",
    ]
      .slice(0, rows)
      .map((rowId) => (
        <div key={rowId} className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-3 w-20 animate-pulse rounded bg-line motion-reduce:animate-none" />
          <div className="h-3 flex-1 animate-pulse rounded bg-bg motion-reduce:animate-none" />
        </div>
      ))}
    <span className="sr-only">{label}…</span>
  </div>
);
