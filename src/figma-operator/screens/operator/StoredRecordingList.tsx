"use client";

import Link from "next/link";
import { useState } from "react";
import {
  type RecordingFilter,
  type RecordingSource,
  recordingPage,
} from "./recording-list-model";

const filters: { value: RecordingFilter; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "device", label: "IoT LISTEN" },
  { value: "manual", label: "Unggah manual" },
];

function dateLabel(value: string | undefined, zone: string) {
  if (!value) return "Waktu belum tercatat";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Waktu tidak valid";

  const formatted = new Intl.DateTimeFormat("id-ID", {
    timeZone:
      zone === "WIB"
        ? "Asia/Jakarta"
        : zone === "WIT"
          ? "Asia/Jayapura"
          : "Asia/Makassar",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  return `${formatted} ${zone}`;
}

type Props = {
  sources: readonly RecordingSource[] | null;
  error: boolean;
  busy: boolean;
  recording: boolean;
  selectedId: string | null;
  timeZone: string;
  onAnalyze: (source: RecordingSource) => void;
  onPlay: (source: RecordingSource) => void;
  playbackLoadingId: string | null;
  analyzing: boolean;
  onRefresh: () => void;
};

/** Six compact cards per page; never interprets a manual upload as an ESP32 receipt. */
export function StoredRecordingList({
  sources,
  error,
  busy,
  recording,
  selectedId,
  timeZone,
  onAnalyze,
  onPlay,
  playbackLoadingId,
  analyzing,
  onRefresh,
}: Props) {
  const [filter, setFilter] = useState<RecordingFilter>("all");
  const [page, setPage] = useState(1);
  const deviceCount =
    sources?.filter((s) => s.kind === "device_recording").length ?? 0;
  const manualCount =
    sources?.filter((s) => s.kind === "human_uploaded_audio").length ?? 0;
  const view = recordingPage(sources ?? [], filter, page);

  return (
    <section
      aria-label="Rekaman bioakustik tersimpan"
      className="rounded-lg border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Rekaman tersimpan</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="rounded-md border border-line px-2.5 py-1.5 text-xs text-fg hover:bg-bg disabled:opacity-50"
          >
            Segarkan
          </button>
          <Link
            href="/operator/listen"
            className="rounded-md border border-brand/25 px-2.5 py-1.5 text-xs font-medium text-brand hover:bg-brand-50"
          >
            Jaringan LISTEN
          </Link>
        </div>
      </div>
      <fieldset className="mt-4 flex flex-wrap gap-2">
        <legend className="sr-only">Filter asal rekaman</legend>
        {filters.map((item) => {
          const count =
            item.value === "all"
              ? deviceCount + manualCount
              : item.value === "device"
                ? deviceCount
                : manualCount;
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => {
                setFilter(item.value);
                setPage(1);
              }}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${filter === item.value ? "border-brand bg-brand-50 text-brand" : "border-line bg-white text-muted hover:bg-bg"}`}
            >
              {item.label} ({count})
            </button>
          );
        })}
      </fieldset>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-line bg-bg p-3 text-xs text-warn"
        >
          Rekaman tidak dapat dimuat dari server.
        </p>
      ) : !sources ? (
        <p role="status" className="mt-4 text-xs text-muted">
          Memuat daftar rekaman…
        </p>
      ) : view.total === 0 ? (
        <p className="mt-4 rounded-md bg-bg p-3 text-xs leading-5 text-muted">
          {filter === "device"
            ? "Belum ada rekaman perangkat LISTEN pada observasi ini. Pantau seluruh perangkat di Jaringan LISTEN."
            : filter === "manual"
              ? "Tidak ada WAV unggahan manual pada observasi ini."
              : "Belum ada rekaman untuk observasi ini."}
        </p>
      ) : (
        <>
          <ul className="mt-4 grid gap-2 md:grid-cols-2">
            {view.items.map((source) => {
              const fromDevice = source.kind === "device_recording";
              return (
                <li
                  key={`${source.kind}:${source.id}`}
                  className={`min-w-0 rounded-lg border p-3 ${selectedId === source.id ? "border-brand/50 bg-brand-50/30" : "border-line bg-white"}`}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p
                        className="truncate text-[13px] font-semibold text-ink"
                        title={source.id}
                      >
                        {fromDevice
                          ? "Rekaman perangkat LISTEN"
                          : "Bukti WAV manual"}
                      </p>
                      <p className="text-xs text-muted">
                        {(source.byteLength / 1024).toFixed(1)} KiB ·{" "}
                        {source.id.slice(0, 8)}
                      </p>
                      <p className="text-[11px] leading-4 text-muted">
                        {dateLabel(source.recordedAt, timeZone)}
                      </p>
                    </div>
                    <span className="rounded border border-line bg-bg px-1.5 py-0.5 text-[10px] text-muted">
                      {fromDevice
                        ? source.ingestionMode === "simulation"
                          ? "Simulasi"
                          : "IoT"
                        : "Manual"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onPlay(source)}
                      disabled={busy || recording}
                      className="rounded-md border border-line px-3 py-2 text-xs font-semibold text-ink hover:bg-bg disabled:opacity-50"
                    >
                      {playbackLoadingId === source.id
                        ? "Memuat WAV…"
                        : "Buka WAV"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onAnalyze(source)}
                      disabled={busy || recording}
                      className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                      {analyzing && selectedId === source.id
                        ? "Menganalisis…"
                        : "Analisis Perch"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="text-xs text-muted">
              {view.start + 1}–
              {Math.min(view.start + view.items.length, view.total)} dari{" "}
              {view.total} rekaman yang dimuat
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={view.page <= 1}
                onClick={() => setPage(view.page - 1)}
                className="rounded-md border border-line px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Sebelumnya
              </button>
              <span className="min-w-12 text-center text-xs tabular-nums text-muted">
                {view.page}/{view.pages}
              </span>
              <button
                type="button"
                disabled={view.page >= view.pages}
                onClick={() => setPage(view.page + 1)}
                className="rounded-md border border-line px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </>
      )}
      <p className="mt-3 text-[11px] leading-4 text-muted">
        Daftar ini dibatasi oleh API sumber audio pada observasi yang dibuka;
        bukan seluruh riwayat jaringan.
      </p>
    </section>
  );
}
