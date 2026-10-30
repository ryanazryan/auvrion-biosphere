"use client";

import { useEffect, useRef, useState } from "react";

type Props = { src: string; title: string };
const stamp = (seconds: number) => {
  const value =
    Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
};

/** Privately authorized same-origin WAV: no public storage URL, no token in UI. */
export function ListenAudioPlayer({ src, title }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      audioRef.current?.pause();
      audioRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  async function toggle() {
    if (loading) return;
    const existing = audioRef.current;
    if (existing) {
      if (!existing.paused) {
        existing.pause();
        setPlaying(false);
      } else {
        try {
          await existing.play();
          setError("");
          setPlaying(true);
        } catch {
          setError(
            "Browser tidak dapat memutar WAV. Periksa format atau izin audio.",
          );
        }
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(src, {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        const reason =
          response.status === 401 || response.status === 403
            ? "Sesi atau izin Supervisor tidak berlaku."
            : response.status === 404
              ? "Rekaman tidak ditemukan atau belum terhubung ke Case."
              : response.status === 503
                ? "Penyimpanan audio belum dapat diakses."
                : `Gagal memuat audio (HTTP ${response.status}).`;
        throw new Error(reason);
      }
      if (!(response.headers.get("content-type") ?? "").includes("audio/wav")) {
        throw new Error("Server tidak mengembalikan audio WAV yang valid.");
      }
      const blob = await response.blob();
      if (blob.size < 44 || blob.size > 10 * 1024 * 1024) {
        throw new Error("Ukuran WAV di luar batas yang diizinkan.");
      }
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audio.preload = "metadata";
      audio.volume = volume / 100;
      audio.addEventListener("loadedmetadata", () => {
        setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
        setReady(true);
      });
      audio.addEventListener("durationchange", () => {
        setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      });
      audio.addEventListener("timeupdate", () => setCurrent(audio.currentTime));
      audio.addEventListener("pause", () => setPlaying(false));
      audio.addEventListener("play", () => setPlaying(true));
      audio.addEventListener("ended", () => {
        setPlaying(false);
        setCurrent(0);
      });
      audio.addEventListener("error", () => {
        setPlaying(false);
        setError("Dekoder browser tidak dapat membaca rekaman ini.");
      });
      audioRef.current = audio;
      await audio.play();
      setReady(true);
      setPlaying(true);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Gagal membuka audio privat.",
        );
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  return (
    <section
      aria-label={`Pemutar bukti audio: ${title}`}
      className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">
            Rekaman asli perangkat LISTEN
          </h3>
        </div>
        <span className="rounded-full border border-line bg-bg px-2.5 py-1 text-[11px] font-semibold text-muted">
          WAV
        </span>
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          aria-label={
            loading
              ? "Memuat rekaman"
              : playing
                ? "Jeda rekaman"
                : "Putar rekaman"
          }
          aria-pressed={playing}
          disabled={loading}
          onClick={() => void toggle()}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-white transition hover:bg-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
        >
          {loading ? (
            <span className="text-xs">…</span>
          ) : playing ? (
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 4.8a1 1 0 0 1 1.52-.86l11 7.2a1 1 0 0 1 0 1.72l-11 7.2A1 1 0 0 1 8 19.2V4.8Z" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex justify-between text-xs tabular-nums text-muted">
            <span>{stamp(current)}</span>
            <span>{ready ? stamp(duration) : "—:—"}</span>
          </div>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step="0.1"
            value={Math.min(current, duration || 1)}
            disabled={!ready || duration <= 0}
            aria-label="Posisi pemutaran audio"
            aria-valuetext={`${stamp(current)} dari ${stamp(duration)}`}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (audioRef.current) audioRef.current.currentTime = next;
              setCurrent(next);
            }}
            className="h-2 w-full cursor-pointer accent-[#177e61] disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              background: `linear-gradient(to right, #177e61 ${progress}%, #dfe7e3 ${progress}%)`,
            }}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-xs text-muted" aria-live="polite">
          {loading
            ? "Mengambil WAV terotorisasi…"
            : ready
              ? playing
                ? "Sedang diputar"
                : "Siap diputar"
              : "Klik Putar untuk mengambil bukti audio"}
        </p>
        <label className="flex items-center gap-2 text-xs text-muted">
          <span>Volume</span>
          <input
            aria-label="Volume rekaman"
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(event) => {
              const next = Number(event.target.value);
              setVolume(next);
              if (audioRef.current) audioRef.current.volume = next / 100;
            }}
            className="w-24 accent-[#177e61]"
          />
          <span className="w-8 text-right tabular-nums">{volume}%</span>
        </label>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-800"
        >
          {error}
        </p>
      )}
      <p className="mt-3 text-[11px] leading-5 text-muted">
        Rekaman perlu didengarkan untuk menilai sumber suara. Foto referensi dan
        kandidat model bukan bukti penemuan spesies.
      </p>
    </section>
  );
}
