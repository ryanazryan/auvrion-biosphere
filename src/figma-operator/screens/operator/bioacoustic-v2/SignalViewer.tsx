"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { AcousticActivityTrack } from "./AcousticActivityTrack";
import type { RawCandidate } from "./candidates";
import { analyzeSignal, displayTime, type SignalData } from "./signal";

type Props = {
  blob: Blob;
  previewUrl: string;
  filename: string;
  candidates?: RawCandidate[];
};
const WIDTH = 800;
const WAVE_HEIGHT = 94;
const SPEC_HEIGHT = 228;

function colorAt(intensity: number, contrast: number): string {
  const e = Math.max(0, Math.min(1, (intensity - 0.15) * contrast + 0.15));
  const hue = 200 - e * 152;
  return `hsl(${hue} ${30 + e * 64}% ${8 + e * 60}%)`;
}

function SignalCanvas({
  signal,
  current,
  zoom,
  kind,
  contrast,
  onSeek,
}: {
  signal: SignalData;
  current: number;
  zoom: number;
  kind: "wave" | "spectrogram";
  contrast: number;
  onSeek: (seconds: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = WIDTH * zoom;
  const height = kind === "wave" ? WAVE_HEIGHT : SPEC_HEIGHT;
  const x0 = kind === "wave" ? 0 : 46;
  const drawWidth = width - x0;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#08171d";
    ctx.fillRect(0, 0, width, height);
    if (kind === "wave") {
      ctx.strokeStyle = "rgba(160, 215, 203, .14)";
      for (let g = 1; g <= 3; g++) {
        ctx.beginPath();
        ctx.moveTo(0, (height * g) / 4);
        ctx.lineTo(width, (height * g) / 4);
        ctx.stroke();
      }
      ctx.strokeStyle = "#62cbb2";
      ctx.lineWidth = Math.max(1, zoom);
      ctx.beginPath();
      signal.peaks.forEach((peak, i) => {
        const x = (i / signal.peaks.length) * width;
        const size = Math.max(0.6, peak * (height / 2 - 6));
        ctx.moveTo(x, height / 2 - size);
        ctx.lineTo(x, height / 2 + size);
      });
      ctx.stroke();
    } else {
      const plotHeight = height - 23;
      for (let x = 0; x < drawWidth; x += 2) {
        const frame =
          signal.spectrum[
            Math.min(
              signal.spectrum.length - 1,
              Math.floor((x / drawWidth) * signal.spectrum.length),
            )
          ];
        if (!frame) continue;
        for (let y = 0; y < plotHeight; y += 2) {
          const bin = Math.min(
            frame.length - 1,
            Math.floor(((plotHeight - y) / plotHeight) * frame.length),
          );
          ctx.fillStyle = colorAt(frame[bin] ?? 0, contrast);
          ctx.fillRect(x0 + x, y, 2, 2);
        }
      }
      ctx.strokeStyle = "rgba(216, 247, 239, 0.18)";
      ctx.fillStyle = "rgba(216, 247, 239, 0.78)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "right";
      for (let i = 0; i <= 4; i++) {
        const y = (plotHeight * i) / 4;
        ctx.beginPath();
        ctx.moveTo(x0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
        const hz = (signal.sampleRate / 2) * (1 - i / 4);
        ctx.fillText(
          hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`,
          x0 - 6,
          Math.max(10, Math.min(plotHeight - 2, y + 3)),
        );
      }
      ctx.textAlign = "center";
      for (let i = 0; i <= 5; i++) {
        const x = x0 + (drawWidth * i) / 5;
        ctx.fillText(
          `${((signal.duration * i) / 5).toFixed(1)}s`,
          x,
          height - 5,
        );
      }
    }
    const cursor =
      x0 + (current / Math.max(0.001, signal.duration)) * drawWidth;
    ctx.fillStyle = "#e4fff8";
    ctx.fillRect(cursor, 0, 1.5, kind === "wave" ? height : height - 23);
  }, [signal, kind, current, width, height, drawWidth, x0, contrast, zoom]);
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(
        0,
        ((event.clientX - rect.left) * (width / rect.width) - x0) / drawWidth,
      ),
    );
    onSeek(ratio * signal.duration);
  };
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      style={{ width, height }}
      onPointerDown={onPointerDown}
      className="block cursor-crosshair"
      aria-label={
        kind === "wave"
          ? "Waveform dari rekaman aktual; klik untuk mengubah waktu pemutaran"
          : "Spektrogram dari rekaman aktual; klik untuk mencari waktu"
      }
      role="img"
    />
  );
}

export function BioacousticSignalViewer({
  blob,
  previewUrl,
  filename,
  candidates = [],
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [signal, setSignal] = useState<SignalData | null>(null);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [showWave, setShowWave] = useState(true);
  const [showSpec, setShowSpec] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const context = new AudioContext();
    let closing = false;
    const safeClose = () => {
      if (closing) return;
      closing = true;
      if (context.state !== "closed") {
        void context.close().catch(() => {});
      }
    };
    setSignal(null);
    setCurrent(0);
    setError("");
    const run = async () => {
      try {
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        const value = analyzeSignal(decoded);
        if (!cancelled) setSignal(value);
      } catch {
        if (!cancelled) setError("Gagal membuat visualisasi dari audio asli.");
      } finally {
        safeClose();
      }
    };
    void run();
    return () => {
      cancelled = true;
      safeClose();
    };
  }, [blob]);
  const seek = (seconds: number) => {
    const next = Math.max(0, Math.min(signal?.duration ?? 0, seconds));
    if (audioRef.current) audioRef.current.currentTime = next;
    setCurrent(next);
  };
  const playPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch {
      setError(
        "Audio tidak dapat dimainkan. Periksa perangkat output browser.",
      );
    }
  };
  const timed = candidates.filter(
    (c) =>
      c.startMs != null &&
      c.endMs != null &&
      c.endMs > c.startMs &&
      c.startMs >= 0,
  );
  return (
    <section
      className="overflow-hidden rounded-md border border-[#254d50] bg-[#08171d] text-[#d8f7ef]"
      aria-label="Visualisasi audio ilmiah"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">Waveform & Spektrogram</h3>
          <p className="mt-0.5 truncate text-xs text-[#a9c8c1]">
            {filename} · visualisasi sinyal audio aktual
          </p>
        </div>
        <span className="rounded border border-[#446568] px-2 py-1 text-[11px]">
          STFT · lokal browser
        </span>
      </div>
      {/* biome-ignore lint/a11y/useMediaCaption: Wildlife audio has no spoken transcript or available accurate caption track. */}
      <audio
        ref={audioRef}
        src={previewUrl}
        preload="metadata"
        aria-label="Pratinjau rekaman asli"
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3">
        <button
          type="button"
          onClick={() => void playPause()}
          aria-label={playing ? "Jeda audio" : "Putar audio"}
          className="rounded-md bg-[#207e6c] px-3 py-1.5 font-medium text-white hover:bg-[#2a9b82]"
        >
          {playing ? "Ⅱ Jeda" : "Putar"}
        </button>
        <span className="min-w-20 font-mono text-xs">
          {displayTime(current)} / {displayTime(signal?.duration ?? 0)}
        </span>
        <input
          type="range"
          aria-label="Posisi audio"
          min={0}
          max={signal?.duration ?? 1}
          step={0.01}
          value={current}
          onChange={(e) => seek(Number(e.target.value))}
          className="min-w-28 flex-1 accent-[#62cbb2]"
          disabled={!signal}
        />
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
            className="rounded border border-white/20 px-2 py-1"
            disabled={zoom <= 1}
            aria-label="Perkecil"
          >
            −
          </button>
          <span className="font-mono">{zoom.toFixed(1)}×</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
            className="rounded border border-white/20 px-2 py-1"
            disabled={zoom >= 4}
            aria-label="Perbesar"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="rounded border border-white/20 px-2 py-1"
          >
            Reset
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-b border-white/10 px-3 py-2 text-xs text-[#c7e3dc]">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showWave}
            onChange={(e) => setShowWave(e.target.checked)}
            className="accent-[#62cbb2]"
          />{" "}
          Waveform
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showSpec}
            onChange={(e) => setShowSpec(e.target.checked)}
            className="accent-[#62cbb2]"
          />{" "}
          Spektrogram
        </label>
        <label className="ml-auto flex items-center gap-2">
          Kontras{" "}
          <input
            type="range"
            aria-label="Kontras spektrogram"
            min={0.6}
            max={1.8}
            step={0.1}
            value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))}
            className="w-20 accent-[#62cbb2]"
          />
        </label>
      </div>
      {!signal ? (
        <div
          className="p-8 text-center text-xs text-[#a9c8c1]"
          aria-live="polite"
        >
          {error || "Mendekode audio dan menghitung STFT..."}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="w-max">
              {showWave && (
                <div className="border-b border-white/10">
                  <SignalCanvas
                    signal={signal}
                    current={current}
                    zoom={zoom}
                    kind="wave"
                    contrast={contrast}
                    onSeek={seek}
                  />
                </div>
              )}
              {showSpec && (
                <SignalCanvas
                  signal={signal}
                  current={current}
                  zoom={zoom}
                  kind="spectrogram"
                  contrast={contrast}
                  onSeek={seek}
                />
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-white/10 px-3 py-2 text-xs text-[#a9c8c1]">
            <span>RMS: {signal.rms.toFixed(5)}</span>
            <span>Peak: {signal.peak.toFixed(5)}</span>
            <span>Nyquist: {(signal.sampleRate / 2000).toFixed(1)} kHz</span>
            {signal.peak < 0.001 && (
              <strong className="text-amber-300">
                Peringatan: sinyal hampir senyap
              </strong>
            )}
            {signal.peak >= 0.999 && (
              <strong className="text-amber-300">
                Peringatan: kemungkinan clipping
              </strong>
            )}
          </div>
        </>
      )}
      {signal && (
        <AcousticActivityTrack
          peaks={signal.peaks}
          duration={signal.duration}
          onSeek={seek}
        />
      )}

      {timed.length > 0 && signal && (
        <div className="border-t border-white/10 p-3">
          <h4 className="text-xs font-semibold">Linimasa deteksi AI</h4>

          <div className="relative mt-2 h-10 rounded bg-white/10">
            {timed.map((c) => (
              <button
                key={`${c.label}-${c.startMs}-${c.endMs}`}
                type="button"
                onClick={() => seek((c.startMs ?? 0) / 1000)}
                className="absolute top-1 h-8 overflow-hidden rounded bg-amber-600/80 px-2 text-left text-[10px] text-white"
                style={{
                  left: `${
                    Math.max(0, (c.startMs ?? 0) / 1000 / signal.duration) * 100
                  }%`,
                  width: `${Math.max(
                    1,
                    (((c.endMs ?? 0) - (c.startMs ?? 0)) /
                      1000 /
                      signal.duration) *
                      100,
                  )}%`,
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
