"use client";

export type CopilotVisualData =
  | {
      kind: "environment";
      region: string;
      retrievedAtUtc: string;
      forecast: { utc: string; tempC: number }[];
      nasaDetections: number | null;
      nasaWindowDays: number | null;
    }
  | {
      kind: "observation";
      id: string;
      domain: string;
      quality: string;
      receivedAt: string;
      source: string;
      audioCount: number | null;
    }
  | {
      kind: "overview";
      total30Days: number;
      unreviewedAllTime: number;
      trend: { date: string; total: number }[];
      partial: boolean;
    }
  | {
      kind: "species";
      query: string;
      matchedName: string | null;
      status: "available" | "partial" | "unavailable";
    };

function timeWita(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Waktu tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
function MiniBars({
  rows,
  unit,
  max,
}: {
  rows: { label: string; value: number }[];
  unit: string;
  max?: number;
}) {
  const ceiling = Math.max(max ?? 0, 1, ...rows.map((row) => row.value));
  return (
    <div
      className="mt-2 flex h-15 items-end gap-1.5"
      role="img"
      aria-label={`${unit}: ${rows.map((r) => `${r.label} ${r.value}`).join(", ")}`}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
          title={`${row.label}: ${row.value} ${unit}`}
        >
          <div
            className="w-full rounded-t-sm bg-brand/65"
            style={{ height: `${Math.max(2, (row.value / ceiling) * 42)}px` }}
          />
        </div>
      ))}
    </div>
  );
}
export function CopilotVisual({ data }: { data: CopilotVisualData }) {
  if (data.kind === "environment") {
    return (
      <section
        aria-label="Visualisasi data lingkungan"
        className="mb-3 rounded-md border border-line bg-white p-2.5"
      >
        <p className="text-xs font-semibold text-ink">{data.region}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-bg p-2">
            <p className="text-[11px] text-muted">NASA · deteksi termal</p>
            <p className="mt-0.5 text-lg font-semibold">
              {data.nasaDetections ?? "–"}
            </p>
            <p className="text-[10px] text-muted">
              {data.nasaWindowDays
                ? `${data.nasaWindowDays} hari`
                : "Sumber tidak tersedia"}
            </p>
          </div>
          <div className="rounded-md bg-bg p-2">
            <p className="text-[11px] text-muted">Slot prakiraan BMKG</p>
            <p className="mt-0.5 text-lg font-semibold">
              {data.forecast.length}
            </p>
            <p className="text-[10px] text-muted">Bukan pengukuran aktual</p>
          </div>
        </div>
        {data.forecast.length > 0 && (
          <>
            <p className="mt-3 text-[11px] font-medium text-muted">
              Suhu prakiraan per slot BMKG (°C)
            </p>
            <MiniBars
              unit="°C"
              max={40}
              rows={data.forecast.map((row) => ({
                label: timeWita(row.utc),
                value: row.tempC,
              }))}
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted">
              <span>{timeWita(data.forecast[0]?.utc ?? "")}</span>
              <span>{timeWita(data.forecast.at(-1)?.utc ?? "")}</span>
            </div>
          </>
        )}
        <p className="mt-2 text-[10px] text-muted">
          Diambil {timeWita(data.retrievedAtUtc)} WITA · deteksi termal bukan
          konfirmasi kebakaran.
        </p>
      </section>
    );
  }
  if (data.kind === "observation")
    return (
      <section
        aria-label="Ringkasan observasi"
        className="mb-3 rounded-md border border-line bg-white p-2.5"
      >
        <p className="truncate font-semibold" title={data.id}>
          Observasi {data.id.slice(0, 8)}…
        </p>
        <dl className="mt-2 grid grid-cols-[5.5rem_1fr] gap-1 text-xs">
          <dt className="text-muted">Domain</dt>
          <dd>{data.domain}</dd>
          <dt className="text-muted">Kualitas</dt>
          <dd>{data.quality}</dd>
          <dt className="text-muted">Sumber</dt>
          <dd className="truncate" title={data.source}>
            {data.source}
          </dd>
          <dt className="text-muted">Diterima</dt>
          <dd>{timeWita(data.receivedAt)} WITA</dd>
          <dt className="text-muted">Audio</dt>
          <dd>
            {data.audioCount === null
              ? "Tidak berlaku"
              : `${data.audioCount} rekaman terdaftar`}
          </dd>
        </dl>
      </section>
    );
  if (data.kind === "overview")
    return (
      <section
        aria-label="Visualisasi ringkasan organisasi"
        className="mb-3 rounded-md border border-line bg-white p-2.5"
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-bg p-2">
            <p className="text-[11px] text-muted">Diterima 30 hari</p>
            <p className="text-lg font-semibold">{data.total30Days}</p>
          </div>
          <div className="rounded-md bg-bg p-2">
            <p className="text-[11px] text-muted">Belum ditinjau</p>
            <p className="text-lg font-semibold">{data.unreviewedAllTime}</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Tren penerimaan 7 hari · WITA
        </p>
        <MiniBars
          unit="observasi"
          rows={data.trend.map((d) => ({ label: d.date, value: d.total }))}
        />
        {data.partial && (
          <p className="mt-2 text-[11px] text-warn">
            Grafik parsial, volume melebihi 5.000 rekaman.
          </p>
        )}
      </section>
    );
  return (
    <section
      aria-label="Referensi taksonomi"
      className="mb-3 rounded-md border border-line bg-white p-2.5"
    >
      <p className="text-xs font-semibold">Referensi spesies</p>
      <p className="mt-1 text-sm">{data.matchedName ?? data.query}</p>
      <p className="mt-1 text-xs text-muted">
        Status: {data.status}. Nama cocok tidak membuktikan kehadiran spesies
        atau deteksi audio.
      </p>
    </section>
  );
}
