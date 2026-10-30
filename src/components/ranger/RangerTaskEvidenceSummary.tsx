import { RangerTaskAudioPlayer } from "./RangerTaskAudioPlayer";

type Evidence = {
  audioRecordings: Array<{
    mediaId: string;
    recordingId: string;
    durationMs: number;
    receivedAt: Date;
  }>;
  sourceKind: string;
  ingestionMode: string;
  measurements: Array<{
    id: string;
    kind: string;
    measuredValue: string;
    unit: string;
  }>;
};
type Observation = {
  id: string;
  sourceCode: string;
  domain: string;
  quality: string;
  linkReason: string | null;
  evidence: Evidence | null;
};

/** The Perch text below is an Operator-authored summary. It is *not* a new inference. */
export function RangerTaskEvidenceSummary({
  observations,
  taskId,
  organizationId,
}: {
  observations: Observation[];
  taskId: string;
  organizationId: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Bukti dan analisis</h2>
        <p className="mt-1 text-xs text-muted">
          Dengarkan bukti asli sebelum membuat laporan.
        </p>
      </div>
      <div className="space-y-4 p-4">
        {observations.length === 0 && (
          <p className="text-xs text-muted">Belum ada observasi tertaut.</p>
        )}
        {observations.map((observation) => {
          const summary = observation.linkReason?.trim() ?? "";
          const candidate =
            /(?:label\s+)([A-Za-z][A-Za-z -]{1,48})(?:\s+dengan\s+skor|\s*\()/i.exec(
              summary,
            );
          return (
            <article
              key={observation.id}
              className="space-y-3 border-b border-line pb-4 last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-ink">
                  Observasi {observation.id.slice(0, 8)}…
                </p>
                <span className="text-[11px] text-muted">
                  {observation.sourceCode} · {observation.quality}
                </span>
              </div>
              {observation.evidence?.audioRecordings.length ? (
                observation.evidence.audioRecordings.map((audio) => (
                  <RangerTaskAudioPlayer
                    key={audio.mediaId}
                    organizationId={organizationId}
                    taskId={taskId}
                    observationId={observation.id}
                    mediaId={audio.mediaId}
                    recordingId={audio.recordingId}
                    durationMs={audio.durationMs}
                  />
                ))
              ) : (
                <p className="text-xs text-muted">
                  Tidak ada rekaman LISTEN yang terhubung.
                </p>
              )}
              {observation.domain === "biodiversity" && summary && (
                <div className="rounded-lg bg-brand-50 p-3">
                  <p className="text-xs font-semibold text-ink">
                    Ringkasan analisis dari Operator
                  </p>
                  {candidate && (
                    <p className="mt-1 text-sm font-medium text-brand">
                      Kandidat: {candidate[1]?.trim()}
                    </p>
                  )}
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-fg">
                    {summary}
                  </p>
                  <details className="mt-2 text-xs text-fg">
                    <summary className="cursor-pointer font-semibold text-brand">
                      Baca ringkasan lengkap
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap leading-5">
                      {summary}
                    </p>
                  </details>
                  <p className="mt-2 text-[11px] text-muted">
                    Perch 2.0 memberikan skor mentah, bukan probabilitas atau
                    konfirmasi penebangan.
                  </p>
                </div>
              )}
              {observation.evidence?.measurements.length ? (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer font-medium text-brand">
                    Data pengukuran
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {observation.evidence.measurements.map((m) => (
                      <li key={m.id}>
                        {m.kind}: {m.measuredValue} {m.unit}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
