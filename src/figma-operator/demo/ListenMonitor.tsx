"use client";

import Link from "next/link";
import {
  LISTEN_DEMO_ROUTE,
  listenHasAudio,
  listenProgress,
  listenSteps,
  resetListenPreview,
  startListenPreview,
  useListenPreview,
} from "./listen-store";
import { openOperatorAssistant } from "./OperatorAssistant";

function StepIndicator({
  label,
  index,
  progress,
}: {
  label: string;
  index: number;
  progress: number;
}) {
  const complete = index < progress;
  return (
    <li className="relative flex min-w-0 items-start gap-2.5 md:flex-col md:gap-2 md:pr-2">
      {index < 4 && (
        <span
          aria-hidden="true"
          className={`absolute left-[12px] top-[11px] hidden h-px w-full md:block ${complete ? "bg-brand/50" : "bg-line"}`}
        />
      )}
      <span
        aria-hidden="true"
        className={`relative grid size-6 shrink-0 place-items-center rounded-full border text-[11px] transition-colors duration-300 ${complete ? "border-brand bg-brand text-white" : "border-line-strong bg-white text-muted"}`}
      >
        {complete ? "✓" : index + 1}
      </span>
      <span
        className={`min-w-0 text-[13px] leading-5 ${complete ? "font-medium text-fg" : "text-muted"}`}
      >
        {label}
      </span>
    </li>
  );
}

/** Identical five-stage Figma composition, with isolated demo state and no live-device claims. */
export function ListenMonitor() {
  const state = useListenPreview();
  const progress = listenProgress(state.step);
  const received = listenHasAudio(state.step);
  return (
    <section
      aria-labelledby="listen-heading"
      className="overflow-hidden rounded-lg border border-line bg-white"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 id="listen-heading" className="text-[15px] font-semibold text-ink">
          Pemantauan LISTEN
        </h2>
        <span className="rounded border border-dashed border-warn/45 px-2 py-0.5 text-[11px] text-warn">
          Demo
        </span>
      </header>
      {state.step === "idle" ? (
        <div className="flex flex-wrap items-center gap-3 px-4 py-4">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand"
            aria-hidden="true"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <title>Gelombang suara</title>
              <path d="M12 3v18M8 7v10M4 10v4M16 5v14M20 9v6" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">
              Belum ada perangkat terhubung
            </p>
            <p className="text-xs text-muted">
              Perangkat akustik · Belum terdaftar
            </p>
          </div>
          <button
            type="button"
            onClick={startListenPreview}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-white px-3 text-[13px] font-medium transition-colors hover:bg-bg"
          >
            ▷ Mulai demo
          </button>
        </div>
      ) : (
        <>
          <dl className="grid divide-y divide-line border-b border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-4 py-3">
              <dt className="text-xs text-muted">Perangkat</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-medium">
                LISTEN-01{" "}
                <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand">
                  Terhubung · Demo
                </span>
              </dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-xs text-muted">Rekaman terakhir</dt>
              <dd className="mt-1 text-[13px] font-medium">
                {received ? "Rekaman diterima" : "Sedang merekam"}
                <span className="mt-0.5 block text-xs font-normal text-muted">
                  {received
                    ? "Sinkronisasi selesai (demo)"
                    : "Menunggu pengiriman"}
                </span>
              </dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-xs text-muted">Analisis</dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex rounded px-2 py-0.5 text-xs ${progress >= 4 ? "bg-warn-50 text-warn" : "bg-bg text-muted"}`}
                >
                  {progress >= 4
                    ? "Perlu ditinjau"
                    : state.step === "processing"
                      ? "Memproses"
                      : "Menunggu"}
                </span>
              </dd>
            </div>
          </dl>
          <ol
            aria-label="Alur analisis rekaman demo"
            className="grid gap-3 border-b border-line px-4 py-4 md:grid-cols-5 md:gap-0"
          >
            {listenSteps.map((label, index) => (
              <StepIndicator
                key={label}
                label={label}
                index={index}
                progress={progress}
              />
            ))}
          </ol>
          {received && (
            <Link
              href={LISTEN_DEMO_ROUTE}
              className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 text-[13px] transition-colors hover:bg-bg"
            >
              <span className="font-medium">demo-listen-01</span>
              <span className="text-muted">Rekaman 60 dtk · Demo</span>
              <span className="ml-auto text-brand">Lihat observasi →</span>
            </Link>
          )}
          <footer className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <p className="min-w-0 flex-1 text-xs leading-5 text-muted">
              Rekaman periodik, bukan siaran langsung.
            </p>
            {received && (
              <button
                type="button"
                onClick={() =>
                  openOperatorAssistant(
                    "listen",
                    "demo-listen-01",
                    undefined,
                    "Jelaskan hasil audio",
                  )
                }
                className="rounded-md px-2 py-1.5 text-[13px] font-medium text-brand hover:bg-brand-50"
              >
                ✧ Jelaskan
              </button>
            )}
            <button
              type="button"
              onClick={resetListenPreview}
              className="rounded-md border border-line-strong px-3 py-1.5 text-xs hover:bg-bg"
            >
              ↻ Reset demo
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
