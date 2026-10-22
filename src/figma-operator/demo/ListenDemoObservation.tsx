"use client";

import Link from "next/link";
import { OperatorLayout } from "../components/operator/OperatorLayout";
import {
  LISTEN_DEMO_ROUTE,
  listenHasAudio,
  useListenPreview,
} from "./listen-store";
import { openOperatorAssistant } from "./OperatorAssistant";

const BARS = Array.from({ length: 60 }, (_, i) => ({
  id: `bar-${i}`,
  highlight: i >= 14 && i < 19,
  height: `${18 + 55 * Math.abs(Math.sin(i * 1.75) * Math.cos(i * 0.37))}%`,
}));

export function ListenDemoObservation() {
  const { step } = useListenPreview();
  const hasAudio = listenHasAudio(step);
  const ready = step === "candidate" || step === "notified";
  return (
    <OperatorLayout
      path={LISTEN_DEMO_ROUTE}
      crumbs={[
        { label: "Observasi", href: "/operator/observations" },
        { label: "LISTEN · Demo" },
      ]}
    >
      <Link
        href="/operator/overview"
        className="mb-5 inline-block text-[13px] text-muted hover:text-brand"
      >
        ← Kembali ke Ringkasan
      </Link>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[25px] font-semibold text-ink">
              demo-listen-01
            </h1>
            <span className="rounded border border-dashed border-warn/50 px-2 py-0.5 text-xs text-warn">
              Data sintetis
            </span>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            Keanekaragaman hayati · LISTEN-01 · Rekaman periodik
          </p>
        </div>
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
          className="rounded-md border border-line px-3 py-2 text-sm font-medium text-brand hover:bg-brand-50"
        >
          ✧ Tanya AI
        </button>
      </header>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-lg border border-line bg-white">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">
              Sumber, ingesti & waktu
            </h2>
            <dl className="divide-y divide-line px-4 text-[13px]">
              <div className="grid grid-cols-2 gap-4 py-3">
                <dt className="text-muted">Sumber</dt>
                <dd>LISTEN-01 (simulasi)</dd>
              </div>
              <div className="grid grid-cols-2 gap-4 py-3">
                <dt className="text-muted">Rekaman sumber</dt>
                <dd>DEMO-REC-01</dd>
              </div>
              <div className="grid grid-cols-2 gap-4 py-3">
                <dt className="text-muted">Mode ingesti</dt>
                <dd>Sinkronisasi tertunda, bukan streaming</dd>
              </div>
              <div className="grid grid-cols-2 gap-4 py-3">
                <dt className="text-muted">Status</dt>
                <dd>{hasAudio ? "Rekaman diterima" : "Belum diterima"}</dd>
              </div>
            </dl>
          </section>
          <section className="overflow-hidden rounded-lg border border-line bg-white">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold">Analisis bioakustik</h2>
              <span className="text-xs text-warn">
                Demo ·{" "}
                {ready
                  ? "Kandidat tersedia"
                  : step === "processing"
                    ? "Memproses"
                    : "Menunggu"}
              </span>
            </div>
            <div className="space-y-4 p-4">
              <div className="rounded-md border border-line bg-bg p-3">
                <p className="text-[13px] text-muted">
                  <b>Rekaman demo 60 detik</b> · tidak ada WAV untuk diputar
                </p>
                <div
                  aria-hidden="true"
                  className="mt-3 flex h-10 items-center gap-[2px] overflow-hidden"
                >
                  {BARS.map((bar) => (
                    <span
                      key={bar.id}
                      className={`min-w-0 flex-1 rounded-full ${ready && bar.highlight ? "bg-warn" : "bg-muted/30"}`}
                      style={{ height: bar.height }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted">
                  <span>00:00</span>
                  <span>00:14–00:19</span>
                  <span>01:00</span>
                </div>
              </div>
              {ready ? (
                <>
                  <div className="rounded-md bg-warn-50 px-4 py-3 text-[13px]">
                    <strong>Pola suara perlu ditinjau</strong>
                    <p className="mt-1 text-muted">
                      Skor tidak melewati ambang; hasil belum diverifikasi
                      manusia.
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
                    <dt className="text-muted">Kandidat</dt>
                    <dd>Vokalisasi burung (contoh)</dd>
                    <dt className="text-muted">Skor model</dt>
                    <dd>0,62 · bukan probabilitas</dd>
                    <dt className="text-muted">Segmen</dt>
                    <dd>00:14–00:19</dd>
                    <dt className="text-muted">Model</dt>
                    <dd>Bioakustik demo v0.3</dd>
                    <dt className="text-muted">Verifikasi</dt>
                    <dd>Belum diverifikasi</dd>
                  </dl>
                </>
              ) : (
                <p className="text-[13px] text-muted">
                  {step === "idle"
                    ? "Mulai demo dari Ringkasan untuk melihat alur analisis."
                    : "Menunggu hasil analisis simulasi."}
                </p>
              )}
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
                className="rounded-md border border-line px-3 py-2 text-[13px] font-medium text-brand hover:bg-brand-50"
              >
                ✧ Jelaskan hasil ini
              </button>
            </div>
          </section>
        </div>
        <aside className="space-y-5">
          <section className="rounded-lg border border-line bg-white p-4">
            <h2 className="text-sm font-semibold">Kualitas</h2>
            <p className="mt-3 text-[13px] text-muted">
              Belum ditinjau · data demo
            </p>
          </section>
          <section className="rounded-lg border border-line bg-white p-4">
            <h2 className="text-sm font-semibold">Lokasi</h2>
            <p className="mt-3 text-[13px] text-muted">
              Tidak ada koordinat demo yang ditampilkan.
            </p>
          </section>
          <section className="rounded-lg border border-line bg-white p-4">
            <h2 className="text-sm font-semibold">Keterbatasan</h2>
            <p className="mt-3 text-[13px] text-muted">
              Tidak tersimpan di PostgreSQL. Tidak ada rekaman WAV nyata maupun
              inferensi AI.
            </p>
          </section>
        </aside>
      </div>
    </OperatorLayout>
  );
}
