"use client";

import type { ReactNode } from "react";
import { type GuestObservation, SPECIES } from "./role-demo-v3-data";

// Distinct page primitives mirror the real workspace spacing and design tokens.
export const PRIMARY =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40";
export const SECONDARY =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-line-strong bg-white px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40";
export const INPUT =
  "w-full rounded-md border border-line-strong bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10";

export function Title({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[25px] font-semibold tracking-tight text-ink sm:text-[28px]">
          {title}
        </h1>
        {detail && (
          <p className="mt-1 text-[13px] leading-6 text-muted">{detail}</p>
        )}
      </div>
      {action}
    </header>
  );
}

export function Surface({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-lg border border-line bg-white shadow-sm ${className}`}
    >
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        {aside}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function MetricGrid({
  items,
  onSelect,
}: {
  items: { label: string; value: string | number; tab?: string }[];
  onSelect?: (tab: string) => void;
}) {
  return (
    <section
      data-tour="metrics"
      aria-label="Ringkasan metrik"
      className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4"
    >
      {items.map((item, index) => (
        <button
          key={item.label}
          type="button"
          className={`min-w-0 p-4 text-left transition ${index === 0 ? "bg-brand-50" : "bg-white"} ${item.tab ? "hover:bg-brand-50" : "cursor-default"}`}
          disabled={!item.tab}
          onClick={() => item.tab && onSelect?.(item.tab)}
        >
          <span className="block text-xs text-muted">{item.label}</span>
          <strong className="mt-1 block text-[27px] font-semibold text-ink">
            {item.value}
          </strong>
        </button>
      ))}
    </section>
  );
}

export function Tag({
  children,
  intent = "neutral",
}: {
  children: ReactNode;
  intent?: "neutral" | "success" | "warning";
}) {
  const style =
    intent === "success"
      ? "bg-brand-50 text-brand border-brand/20"
      : intent === "warning"
        ? "bg-warn-50 text-warn border-warn/20"
        : "bg-bg text-muted border-line";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium ${style}`}
    >
      {children}
    </span>
  );
}

export function Activity({ items }: { items: string[] }) {
  return (
    <ol className="divide-y divide-line">
      {items.map((item) => (
        <li
          key={item}
          className="flex items-start gap-3 py-3 text-[13px] leading-5 text-fg"
        >
          <span className="mt-1 inline-block size-2 shrink-0 rounded-full bg-brand" />
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function ObservationRows({
  items,
  select,
  onForward,
}: {
  items: GuestObservation[];
  select: (item: GuestObservation) => void;
  onForward?: (id: string) => void;
}) {
  return (
    <div data-tour="records" className="overflow-x-auto">
      <table className="w-full min-w-[570px] text-left text-[13px]">
        <thead className="border-b border-line bg-bg text-xs text-muted">
          <tr>
            <th className="px-3 py-3 font-medium">Observasi</th>
            <th className="px-3 py-3 font-medium">Domain / sumber</th>
            <th className="px-3 py-3 font-medium">Kualitas</th>
            <th className="px-3 py-3 font-medium">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-bg/70">
              <td className="px-3 py-3">
                <span className="block font-mono text-[11px] text-muted">
                  {item.id}
                </span>
                <strong className="text-ink">{item.title}</strong>
              </td>
              <td className="px-3 py-3">
                <span className="block text-ink">
                  {item.domain === "biodiversity"
                    ? "Biodiversitas"
                    : "Risiko lingkungan"}
                </span>
                <span className="text-xs text-muted">{item.source}</span>
              </td>
              <td className="px-3 py-3">
                <Tag
                  intent={item.status === "forwarded" ? "success" : "warning"}
                >
                  {item.status === "forwarded"
                    ? "Diteruskan"
                    : item.status === "under_review"
                      ? "Dalam review"
                      : "Belum ditinjau"}
                </Tag>
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="font-semibold text-brand hover:underline"
                    onClick={() => select(item)}
                  >
                    Detail
                  </button>
                  {onForward && item.status !== "forwarded" && (
                    <button
                      type="button"
                      className="font-semibold text-brand hover:underline"
                      onClick={() => onForward(item.id)}
                    >
                      Kirim →
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PerchResults({
  analyzed,
  onAnalyze,
  reviewed,
  onReview,
}: {
  analyzed: boolean;
  onAnalyze: () => void;
  reviewed: boolean;
  onReview: () => void;
}) {
  return (
    <section
      data-tour="perch"
      className="overflow-hidden rounded-lg border border-line bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-[14px] font-semibold text-ink">
          Analisis bioakustik · Perch 2.0
        </h2>
        <Tag intent="warning">Belum diverifikasi</Tag>
      </div>
      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-line bg-[#f4f9f5] p-4">
          <p className="text-xs font-semibold text-ink">LISTEN-01 / REC-0006</p>
          <p className="mt-1 text-xs text-muted">
            Rekaman historis · ESP32 + mikrofon I2S · 29 Okt 2026
          </p>
          <div
            aria-hidden="true"
            className="mt-4 flex h-16 items-center justify-between gap-[2px] overflow-hidden rounded-md bg-white px-3"
          >
            {Array.from({ length: 52 }, (_, index) => ({
              id: `waveform-bar-${index}`,
              height: 18 + ((index * 17 + 11) % 43),
            })).map((bar) => (
              <span
                key={bar.id}
                className="w-1 shrink-0 rounded-full bg-[#22946f]"
                style={{ height: `${bar.height}px` }}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Visualisasi sinyal sampel • durasi 00:20
          </p>
        </div>
        {!analyzed ? (
          <button type="button" className={PRIMARY} onClick={onAnalyze}>
            Jalankan analisis Perch 2.0 →
          </button>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Kandidat teratas
            </p>
            <div className="space-y-3">
              {SPECIES.map((candidate) => (
                <div
                  key={candidate.scientific}
                  className="grid grid-cols-[minmax(0,1fr)_52px] items-center gap-x-3 gap-y-1"
                >
                  <div className="min-w-0">
                    <strong className="block text-[13px] text-ink">
                      {candidate.name}
                    </strong>
                    <em className="block text-xs text-muted">
                      {candidate.scientific}
                    </em>
                  </div>
                  <span className="text-right font-mono text-[13px] text-brand">
                    {Math.round(candidate.score * 100)}%
                  </span>
                  <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${candidate.score * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="rounded-md border border-[#e4d6bd] bg-[#fff8ea] px-3 py-2 text-xs leading-5 text-[#765b29]">
              Skor adalah kandidat model, bukan bukti identifikasi spesies.
              Perlu kualitas rekaman yang memadai dan tinjauan manusia.
            </p>
            <button
              type="button"
              className={SECONDARY}
              onClick={onReview}
              disabled={reviewed}
            >
              {reviewed
                ? "Analisis sudah ditinjau"
                : "Tandai hasil telah ditinjau"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
