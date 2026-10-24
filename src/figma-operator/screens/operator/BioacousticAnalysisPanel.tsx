"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { useOperator } from "../../operator-context";

/** WC-023 Slice 03A — Figma-aligned UI with REAL WC-010 persistence and Perch inference. */
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SECONDS = 30;
const MIC_LIMIT_SECONDS = 20;

type Source = {
  kind: "human_uploaded_audio" | "device_recording";
  id: string;
  byteLength: number;
  sha256: string;
};
type Discovery = {
  status: "no_audio" | "analyzer_not_configured" | "unsupported_domain";
  verification: "no_ai_predictions_available";
  sources: Source[];
};
type Candidate = {
  label: string;
  scientificName: string | null;
  modelScore: number;
  startMs: number | null;
  endMs: number | null;
};
type Inference = {
  status: "succeeded" | "no_candidates";
  verification: "unverified";
  provider: "Google";
  modelId: "perch-v2";
  modelVersion: string;
  candidates: Candidate[];
  mediaId: string;
  audioSha256: string;
  analyzedAt: string;
  persistence: "ephemeral_result";
};
type AudioItem = {
  blob: Blob;
  filename: string;
  seconds: number;
  original: "manual_wav_upload" | "browser_microphone_simulation";
};

function errText(code: string): string {
  const messages: Record<string, string> = {
    MFA_ASSURANCE_REQUIRED:
      "Sesi belum memiliki verifikasi MFA yang berlaku. Verifikasi ulang akun.",
    ROLE_OR_SCOPE_DENIED:
      "Akun tidak memiliki akses Operator pada organisasi ini.",
    PERCH_WORKER_NOT_CONFIGURED:
      "Worker Perch belum dikonfigurasi di server Next.js.",
    PERCH_WORKER_UNAVAILABLE:
      "Perch 2.0 belum siap atau koneksi worker terputus.",
    PERCH_INVALID_RESULT: "Respons model tidak memenuhi kontrak keamanan.",
    AUDIO_TOO_LARGE: "WAV melebihi batas 10 MiB.",
    AUDIO_DURATION_EXCEEDED: "Durasi audio melebihi 30 detik.",
    INVALID_AUDIO: "Audio tidak valid untuk diproses.",
    ORIGIN_NOT_ALLOWED: "Asal permintaan ditolak server.",
    EVIDENCE_RECONCILIATION_REQUIRED:
      "Audio tersimpan tetapi integritasnya belum bisa dipastikan.",
  };
  return messages[code] ?? `Permintaan tidak berhasil (${code}).`;
}

async function checkResponse(response: Response): Promise<unknown> {
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `HTTP_${response.status}`;
    throw new Error(errText(code));
  }
  return data;
}

/** Canonical WC-010 audio: mono PCM16 at 16 kHz, capped to 30 seconds. */
async function toWavPcm16(
  file: Blob,
): Promise<{ blob: Blob; seconds: number }> {
  if (file.size === 0 || file.size > MAX_BYTES)
    throw new Error("Berkas kosong atau lebih besar dari 10 MiB.");
  const decoder = new AudioContext();
  let original: AudioBuffer;
  try {
    original = await decoder.decodeAudioData(await file.arrayBuffer());
  } finally {
    await decoder.close();
  }
  if (
    !Number.isFinite(original.duration) ||
    original.duration <= 0 ||
    original.duration > MAX_SECONDS
  ) {
    throw new Error("Durasi audio harus lebih dari 0 dan maksimum 30 detik.");
  }
  const frames = Math.ceil(original.duration * 16000);
  const offline = new OfflineAudioContext(1, frames, 16000);
  const source = offline.createBufferSource();
  source.buffer = original;
  source.connect(offline.destination);
  source.start();
  const converted = await offline.startRendering();
  const pcm = converted.getChannelData(0);
  const bytes = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(bytes);
  function putText(offset: number, value: string) {
    for (let n = 0; n < value.length; n += 1)
      view.setUint8(offset + n, value.charCodeAt(n));
  }
  putText(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  putText(8, "WAVE");
  putText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  putText(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[i] ?? 0));
    view.setInt16(
      44 + i * 2,
      sample < 0 ? sample * 32768 : sample * 32767,
      true,
    );
  }
  return {
    blob: new Blob([bytes], { type: "audio/wav" }),
    seconds: converted.duration,
  };
}

export function BioacousticAnalysisPanel({
  observationId,
}: {
  observationId: string;
}) {
  const { operator } = useOperator();
  const organizationId = operator.organizationId;
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [discoveryError, setDiscoveryError] = useState(false);
  const [audio, setAudio] = useState<AudioItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<
    "preparing" | "uploading" | "analyzing" | null
  >(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Inference | null>(null);
  const [savedMediaId, setSavedMediaId] = useState<string | null>(null);
  const [stored, setStored] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const microphoneChunks = useRef<Blob[]>([]);
  const micTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const uploadKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDiscovery(null);
    setDiscoveryError(false);
    const url = `/api/observations/${encodeURIComponent(observationId)}/bioacoustics?organizationId=${encodeURIComponent(organizationId)}`;
    fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await checkResponse(response)) as Discovery;
        if (
          data?.verification !== "no_ai_predictions_available" ||
          !Array.isArray(data?.sources)
        ) {
          throw new Error("INVALID_DISCOVERY");
        }
        if (!controller.signal.aborted) setDiscovery(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDiscoveryError(true);
      });
    return () => controller.abort();
  }, [observationId, organizationId]);

  useEffect(() => {
    if (!audio) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(audio.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);

  useEffect(
    () => () => {
      if (micTimeout.current) clearTimeout(micTimeout.current);
      if (mediaRecorder.current?.state === "recording") {
        mediaRecorder.current.onstop = null;
        mediaRecorder.current.stop();
      }
      mediaStream.current?.getTracks().forEach((track) => {
        track.stop();
      });
    },
    [],
  );

  const selectAudio = async (
    blob: Blob,
    name: string,
    original: AudioItem["original"],
  ) => {
    setError("");
    setResult(null);
    setSavedMediaId(null);
    setStored(false);
    setBusy("preparing");
    uploadKeyRef.current = crypto.randomUUID();
    try {
      const converted = await toWavPcm16(blob);
      setAudio({
        blob: converted.blob,
        filename: name,
        seconds: converted.seconds,
        original,
      });
    } catch (cause) {
      setAudio(null);
      setError(
        cause instanceof Error ? cause.message : "Audio tidak dapat dibaca.",
      );
    } finally {
      setBusy(null);
    }
  };

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".wav")) {
      setError("Pilih file WAV; rekaman mikrofon menggunakan tab tersendiri.");
      return;
    }
    void selectAudio(file, file.name, "manual_wav_upload");
  };

  const stopMicrophone = () => {
    if (micTimeout.current) {
      clearTimeout(micTimeout.current);
      micTimeout.current = null;
    }
    if (mediaRecorder.current?.state === "recording")
      mediaRecorder.current.stop();
  };

  const startMicrophone = async () => {
    setError("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("Browser tidak mendukung perekaman mikrofon.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream.current = stream;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      mediaRecorder.current = recorder;
      microphoneChunks.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) microphoneChunks.current.push(event.data);
      };
      recorder.onstop = () => {
        if (micTimeout.current) clearTimeout(micTimeout.current);
        micTimeout.current = null;
        mediaStream.current?.getTracks().forEach((track) => {
          track.stop();
        });
        mediaStream.current = null;
        setRecording(false);
        const blob = new Blob(microphoneChunks.current, {
          type: recorder.mimeType,
        });
        if (blob.size)
          void selectAudio(
            blob,
            "rekaman-mikrofon.wav",
            "browser_microphone_simulation",
          );
        else setError("Rekaman mikrofon kosong.");
      };
      recorder.start(250);
      setRecording(true);
      micTimeout.current = setTimeout(stopMicrophone, MIC_LIMIT_SECONDS * 1000);
    } catch {
      mediaStream.current?.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStream.current = null;
      setRecording(false);
      setError("Izin mikrofon ditolak atau perangkat tidak tersedia.");
    }
  };

  const saveAndAnalyze = async () => {
    if (!audio || busyRef.current) return;
    busyRef.current = true;
    setError("");
    setResult(null);
    try {
      const base = `/api/observations/${encodeURIComponent(observationId)}`;
      let mediaId = savedMediaId;
      if (!mediaId) {
        setBusy("uploading");
        const uploadKey = uploadKeyRef.current ?? crypto.randomUUID();
        uploadKeyRef.current = uploadKey;
        const uploaded = await fetch(
          `${base}/evidence/audio?organizationId=${encodeURIComponent(organizationId)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "audio/wav",
              "Idempotency-Key": uploadKey,
            },
            body: audio.blob,
            credentials: "same-origin",
            cache: "no-store",
          },
        );
        const saved = (await checkResponse(uploaded)) as { mediaId: string };
        if (typeof saved.mediaId !== "string")
          throw new Error("Server tidak mengembalikan ID evidence.");
        mediaId = saved.mediaId;
        setSavedMediaId(mediaId);
        setStored(true);
        setDiscovery(
          (previous) =>
            previous && {
              ...previous,
              sources: [
                {
                  kind: "human_uploaded_audio",
                  id: saved.mediaId,
                  byteLength: audio.blob.size,
                  sha256: "",
                },
                ...previous.sources,
              ],
            },
        );
      }
      setBusy("analyzing");
      const response = await fetch(
        `${base}/bioacoustics/analyze?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaId }),
        },
      );
      const analysis = (await checkResponse(response)) as Inference;
      if (
        analysis.verification !== "unverified" ||
        !Array.isArray(analysis.candidates)
      ) {
        throw new Error("Respons Perch tidak valid.");
      }
      setResult(analysis);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Permintaan gagal.");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 text-[13px] text-fg">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded border border-line bg-bg px-2 py-1 text-xs text-muted">
          LISTEN Simulator · audio pengujian
        </span>
        <span className="text-xs text-muted">
          Perch 2.0 · inferensi sungguhan
        </span>
      </div>
      <p className="text-xs leading-5 text-muted">
        Upload dari laptop atau rekam mikrofon. WAV akan disimpan melalui
        evidence privat WC-010, lalu dianalisis oleh worker Perch lokal. Ini
        bukan data ESP32 atau observasi lapangan terverifikasi.
      </p>
      <div className="rounded-md border border-line bg-bg/40 p-3 space-y-3">
        <h3 className="font-semibold text-ink">
          Sumber Audio — LISTEN Simulator
        </h3>
        <label className="block rounded-md border border-dashed border-line bg-surface p-4 text-center cursor-pointer hover:border-brand">
          <span className="font-medium text-brand">Unggah WAV</span>
          <span className="mt-1 block text-xs text-muted">
            PCM16 (dikonversi browser) · maksimal 10 MiB dan 30 detik
          </span>
          <input
            aria-label="Pilih WAV"
            type="file"
            accept=".wav,audio/wav,audio/x-wav"
            onChange={choose}
            disabled={!!busy || recording}
            className="mt-2 block w-full text-xs text-muted file:rounded file:border file:border-line file:bg-surface file:px-2 file:py-1"
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!!busy || recording}
            onClick={() => void startMicrophone()}
            className="rounded-md border border-line bg-surface px-3 py-2 font-medium text-ink disabled:opacity-50"
          >
            Rekam mikrofon laptop
          </button>
          {recording && (
            <button
              type="button"
              onClick={stopMicrophone}
              className="rounded-md border border-line px-3 py-2 font-medium text-warn"
            >
              Stop rekaman
            </button>
          )}
          <span aria-live="polite" className="text-xs text-muted">
            {recording ? "● Merekam (maks. 20 detik)" : "Mode uji"}
          </span>
        </div>
        {audio && (
          <div className="rounded-md border border-line bg-surface p-3 space-y-2">
            <p className="font-medium break-all">{audio.filename}</p>
            <p className="text-xs text-muted">
              {audio.original === "browser_microphone_simulation"
                ? "Mikrofon laptop"
                : "WAV lokal"}{" "}
              ·
              {` ${audio.seconds.toFixed(2)} dtk · ${(audio.blob.size / 1024).toFixed(1)} KiB · PCM16 mono 16 kHz`}
            </p>
            {previewUrl && (
              // biome-ignore lint/a11y/useMediaCaption: This is non-speech wildlife evidence without an available accurate caption track.
              <audio
                aria-label="Preview rekaman suara satwa (tanpa transkrip)"
                src={previewUrl}
                controls
                preload="metadata"
                className="w-full"
              />
            )}
          </div>
        )}
      </div>
      <div className="border-t border-line pt-4 space-y-2">
        <h3 className="font-semibold text-ink">Kontrol analisis</h3>
        <button
          type="button"
          disabled={!audio || !!busy || recording}
          onClick={() => void saveAndAnalyze()}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy === "preparing"
            ? "Memproses audio..."
            : busy === "uploading"
              ? "Menyimpan WAV privat..."
              : busy === "analyzing"
                ? "Perch 2.0 menganalisis..."
                : savedMediaId
                  ? "Analisis ulang dengan Perch 2.0"
                  : "Simpan WAV & analisis Perch 2.0"}
        </button>
        {stored && (
          <p className="text-xs text-muted">
            WAV telah tersimpan secara privat dan terhubung ke observasi ini.
            Hasil AI belum disimpan permanen.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md border border-line bg-bg p-2 text-warn"
          >
            {error}
          </p>
        )}
      </div>
      <section
        aria-label="Hasil analisis bioakustik"
        className="border-t border-line pt-4 space-y-3"
      >
        <h3 className="font-semibold text-ink">Hasil Analisis Bioakustik</h3>
        {!result && (
          <p aria-live="polite" className="text-muted">
            {busy === "analyzing"
              ? "Model sedang memproses rekaman..."
              : "Belum ada hasil inferensi nyata pada sesi ini."}
          </p>
        )}
        {result && (
          <>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
              <span>Google Perch 2.0 · {result.modelVersion}</span>
              <span className="rounded border border-line px-2 py-0.5">
                Belum diverifikasi manusia
              </span>
            </div>
            {result.candidates.length === 0 ? (
              <p>Tidak ada kandidat yang dihasilkan model.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="py-2">
                        Kandidat
                      </th>
                      <th scope="col" className="py-2 text-right">
                        Skor mentah
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.candidates.map((candidate) => (
                      <tr
                        key={candidate.label}
                        className="border-b border-line"
                      >
                        <td className="py-2 pr-2 break-words">
                          {candidate.label}
                        </td>
                        <td className="py-2 text-right font-mono">
                          {candidate.modelScore.toFixed(6)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="break-all text-xs text-muted">
              SHA-256 WAV tersimpan: {result.audioSha256}
            </p>
            <p className="text-xs text-muted">
              Skor bukan persentase atau probabilitas keberadaan spesies. Hasil
              hanya kandidat sementara, belum terverifikasi dan tidak mengubah
              kualitas observasi.
            </p>
          </>
        )}
      </section>
      <section className="border-t border-line pt-3 space-y-1">
        <h3 className="font-semibold text-ink">Peninjauan manusia</h3>
        <p className="text-xs text-muted">
          Operator/peninjau wajib mendengarkan audio dan mengecek konteks
          ekologis sebelum menyimpulkan identitas satwa. Belum ada aksi
          verifikasi atau penyimpanan hasil AI otomatis.
        </p>
      </section>
      <section className="border-t border-line pt-3 text-xs text-muted">
        {!discovery && !discoveryError
          ? "Memuat rekaman tersimpan..."
          : discoveryError
            ? "Metadata sumber audio belum dapat diambil."
            : `Sumber audio terdaftar untuk observasi ini: ${discovery?.sources.length ?? 0}.`}
      </section>
    </div>
  );
}
