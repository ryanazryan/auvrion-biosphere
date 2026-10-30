"use client";

export function RangerTaskAudioPlayer({
  taskId,
  observationId,
  mediaId,
  organizationId,
  recordingId,
  durationMs,
}: {
  taskId: string;
  observationId: string;
  mediaId: string;
  organizationId: string;
  recordingId: string;
  durationMs: number;
}) {
  const url = `/api/ranger/tasks/${encodeURIComponent(taskId)}/observations/${encodeURIComponent(observationId)}/audio/${encodeURIComponent(mediaId)}?organizationId=${encodeURIComponent(organizationId)}`;
  return (
    <div className="space-y-2 rounded-lg border border-line bg-bg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink">Rekaman LISTEN ESP32</p>
          <p className="mt-1 break-all text-[11px] text-muted">{recordingId}</p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {(durationMs / 1000).toFixed(1)} dtk
        </span>
      </div>
      {/* biome-ignore lint/a11y/useMediaCaption: Rekaman lapangan mentah belum memiliki caption terverifikasi; ringkasan kandidat tersedia secara terpisah. */}
      <audio
        className="w-full"
        controls
        preload="none"
        src={url}
        aria-label="Putar bukti audio LISTEN"
      />
      <p className="mt-2 text-xs text-muted">
        Rekaman lapangan belum memiliki transkrip atau caption terverifikasi.
        Hasil analisis Perch merupakan kandidat suara dan bukan konfirmasi
        kejadian.
      </p>
    </div>
  );
}
