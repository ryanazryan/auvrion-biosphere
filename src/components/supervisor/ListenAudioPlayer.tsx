"use client";

import { useEffect, useRef, useState } from "react";

type Props = { src: string; title: string };

function stamp(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Private, role-scoped WAV playback. Never render a public/media storage URL. */
export function ListenAudioPlayer({ src, title }: Props) {
  const sound = useRef<HTMLAudioElement | null>(null);
  const blobUrl = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const [volume, setVolume] = useState(80);

  useEffect(() => {
    return () => {
      sound.current?.pause();
      sound.current = null;
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = null;
    };
  }, []);

  async function toggle() {
    if (busy) return;
    const active = sound.current;
    if (active) {
      if (!active.paused) {
        active.pause();
        setPlaying(false);
      } else {
        try {
          await active.play();
          setPlaying(true);
        } catch {
          setError(
            "Browser menolak pemutaran audio. Coba klik Putar sekali lagi.",
          );
        }
      }
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(src, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const kind =
          response.status === 401 || response.status === 403
            ? "Sesi atau izin Supervisor tidak berlaku. Login ulang."
            : response.status === 404
              ? "Rekaman tidak ditemukan atau tidak terkait Case."
              : response.status === 503
                ? "Penyimpanan rekaman belum dapat diakses."
                : `Audio gagal dimuat (HTTP ${response.status}).`;
        throw new Error(kind);
      }
      if (!(response.headers.get("content-type") ?? "").includes("audio/wav")) {
        throw new Error("Server tidak mengembalikan berkas WAV yang valid.");
      }
      const bytes = await response.blob();
      if (bytes.size < 44 || bytes.size > 10 * 1024 * 1024) {
        throw new Error("Ukuran rekaman WAV tidak valid.");
      }
      const url = URL.createObjectURL(bytes);
      blobUrl.current = url;
      const audio = new Audio(url);
      audio.volume = volume / 100;
      audio.addEventListener("loadedmetadata", () => {
        setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
        setLoaded(true);
      });
      audio.addEventListener("timeupdate", () => setCurrent(audio.currentTime));
      audio.addEventListener("durationchange", () =>
        setDuration(Number.isFinite(audio.duration) ? audio.duration : 0),
      );
      audio.addEventListener("pause", () => setPlaying(false));
      audio.addEventListener("ended", () => {
        setPlaying(false);
        setCurrent(0);
      });
      audio.addEventListener("error", () =>
        setError("Dekoder browser tidak dapat memutar rekaman ini."),
      );
      sound.current = audio;
      await audio.play();
      setPlaying(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Gagal memuat rekaman privat.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label={`Pemutar audio ${title}`}
      className="mt-3 space-y-3 rounded-xl border border-line bg-[#f4f8f6] p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink">
            Bukti audio LISTEN
          </p>
          <p className="mt-1 text-xs text-muted">
            Rekaman privat terhubung ke Case · Identifikasi spesies belum
            terverifikasi
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-brand">
          WAV
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={playing ? "Jeda rekaman" : "Putar rekaman"}
          aria-pressed={playing}
          disabled={busy}
          onClick={() => void toggle()}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white hover:bg-brand-hover disabled:opacity-55"
        >
          {busy ? "…" : playing ? "Ⅱ" : "▶"}
        </button>
        <span className="min-w-9 text-xs tabular-nums text-muted">
          {stamp(current)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(current, duration || 1)}
          disabled={!loaded || duration <= 0}
          aria-label="Posisi pemutaran audio"
          className="min-w-0 flex-1 accent-[#177e61]"
          onChange={(event) => {
            const next = Number(event.target.value);
            if (sound.current) sound.current.currentTime = next;
            setCurrent(next);
          }}
        />
        <span className="min-w-9 text-right text-xs tabular-nums text-muted">
          {stamp(duration)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted" aria-live="polite">
          {loaded
            ? "Bukti siap didengarkan"
            : "Klik putar untuk mengambil WAV yang telah diotorisasi"}
        </p>
        <label className="flex items-center gap-2 text-xs text-muted">
          Volume
          <input
            aria-label="Volume"
            type="range"
            min={0}
            max={100}
            value={volume}
            className="w-20 accent-[#177e61]"
            onChange={(event) => {
              const value = Number(event.target.value);
              setVolume(value);
              if (sound.current) sound.current.volume = value / 100;
            }}
          />
        </label>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-2 text-xs text-red-800"
        >
          {error}
        </p>
      )}
      <p className="text-xs leading-5 text-muted">
        Alternatif tekstual: periksa ringkasan dan keterbatasan bukti di bawah.
        Ringkasan tidak setara transkripsi atau identifikasi suara
        terverifikasi.
      </p>
    </section>
  );
}
