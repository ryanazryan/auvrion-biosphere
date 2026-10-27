"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SelectMenu } from "@/components/ui/SelectMenu";
import type { OperationalSummary } from "@/server/analytics/operational-summary";
import {
  SIGNAL_CLASSES,
  SIGNAL_COLORS,
  SIGNAL_LABELS,
  type SignalClass,
} from "@/server/analytics/signal-taxonomy";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];
const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);

function demoData(year: number): OperationalSummary {
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    cases: [1, 1, 2, 0, 3, 3, 2, 4, 2, 3, 0, 0][i] ?? 0,
    observations: [3, 4, 5, 5, 7, 9, 9, 8, 10, 12, 0, 0][i] ?? 0,
    fire_indicator: [0, 1, 1, 0, 1, 1, 1, 1, 0, 2, 0, 0][i] ?? 0,
    chainsaw_like: [0, 0, 1, 0, 1, 1, 0, 1, 2, 2, 0, 0][i] ?? 0,
    gunshot_like: [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0][i] ?? 0,
    biodiversity_signal: [1, 1, 2, 2, 2, 3, 3, 2, 3, 3, 0, 0][i] ?? 0,
  }));
  return {
    year,
    months,
    cases: 21,
    observations: 72,
    fieldFindings: 16,
    completedTasks: 9,
    taskStatus: [],
    signalsByClass: {
      fire_indicator: 7,
      chainsaw_like: 8,
      gunshot_like: 3,
      human_activity: 5,
      biodiversity_signal: 22,
      unclassified: 4,
    },
    reviews: { unreviewed: 24, corroborated: 16, rejected: 9 },
    totalSignals: 49,
    biodiversityObservations: 36,
    listenRecordings: 31,
    recentSignals: [],
    caveat:
      "SELURUH ANGKA PADA MODE INI ADALAH SIMULASI VISUAL. Tidak tersimpan di database dan bukan hasil perangkat ataupun deteksi AI.",
  };
}

type Props = {
  data: OperationalSummary;
  preview: boolean;
  organizationId: string;
};

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {subtitle && <p className="sr-only">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ReviewControl({
  id,
  version,
  organizationId,
}: {
  id: string;
  version: number;
  organizationId: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"corroborated" | "rejected">(
    "corroborated",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (note.trim().length < 20) {
      setError("Alasan review minimal 20 karakter.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/supervisor/signals/${encodeURIComponent(id)}/review?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: version,
            reviewStatus: status,
            note: note.trim(),
          }),
        },
      );
      if (!response.ok) throw new Error(`REVIEW_FAILED_${response.status}`);
      router.refresh();
    } catch {
      setError(
        "Review gagal atau sudah berubah. Muat ulang dan periksa status.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2 space-y-2 rounded-md bg-bg p-3">
      <SelectMenu
        label="Keputusan bukti"
        value={status}
        onChange={setStatus}
        options={[
          { value: "corroborated", label: "Didukung hasil pemeriksaan" },
          { value: "rejected", label: "Ditolak / salah indikasi" },
        ]}
      />
      <label className="block text-xs font-medium text-ink">
        Alasan dan bukti
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={1500}
          placeholder="Jelaskan dasar verifikasi, bukan hanya persetujuan AI."
          className="mt-1 block w-full rounded-md border border-line bg-white p-2 text-xs"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <button
        disabled={busy || note.trim().length < 20}
        type="button"
        onClick={() => void submit()}
        className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Menyimpan…" : "Simpan review"}
      </button>
    </div>
  );
}

export function OperationalCharts({ data, preview, organizationId }: Props) {
  const d = preview ? demoData(data.year) : data;
  const max = Math.max(
    1,
    ...d.months.flatMap((row) => [
      row.fire_indicator,
      row.chainsaw_like,
      row.gunshot_like,
      row.biodiversity_signal,
    ]),
  );
  const total = d.totalSignals;
  let cumulative = 0;
  const segments = SIGNAL_CLASSES.map((kind) => {
    const begin = cumulative;
    cumulative += d.signalsByClass[kind];
    return {
      kind,
      from: (360 * begin) / Math.max(1, total),
      to: (360 * cumulative) / Math.max(1, total),
    };
  });
  const gradient =
    total === 0
      ? "#E8ECEB 0 360deg"
      : `conic-gradient(${segments
          .filter((s) => s.to > s.from)
          .map((s) => `${SIGNAL_COLORS[s.kind]} ${s.from}deg ${s.to}deg`)
          .join(",")})`;
  const kpis: [string, number, string][] = [
    [
      "Indikasi risiko kebakaran",
      d.signalsByClass.fire_indicator,
      "Sinyal belum tentu kebakaran",
    ],
    [
      "Suara menyerupai chainsaw",
      d.signalsByClass.chainsaw_like,
      "Bukan bukti illegal logging",
    ],
    [
      "Suara menyerupai tembakan",
      d.signalsByClass.gunshot_like,
      "Bukan konfirmasi poaching",
    ],
    [
      "Observasi biodiversitas",
      d.biodiversityObservations,
      "Observasi masuk, bukan spesies terkonfirmasi",
    ],
    [
      "Menunggu review sinyal",
      d.reviews.unreviewed,
      "Perlu pemeriksaan manusia",
    ],
    [
      "Indikasi didukung review",
      d.reviews.corroborated,
      "Bukan putusan insiden atau tindak pidana",
    ],
  ];
  return (
    <div className="space-y-5">
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${preview ? "border-amber-300 bg-amber-50 text-amber-950" : "border-line bg-bg text-muted"}`}
        role="status"
      >
        {preview
          ? "MODE SIMULASI — semua angka di bawah adalah contoh visual, tidak masuk ke database dan tidak berasal dari IoT."
          : "MODE OPERASIONAL — angka berasal dari PostgreSQL, tanpa data observasi berlabel simulation. Sinyal tanpa rekaman klasifikasi tersimpan ditampilkan sebagai nol."}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map(([title, value, subtitle]) => (
          <div
            key={title}
            className="dash-enter rounded-xl border border-line bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-medium text-muted">{title}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">
              {fmt(value)}
            </p>
            <p className="mt-2 text-[11px] leading-4 text-muted">{subtitle}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel
          title="Komposisi sinyal terklasifikasi"
          subtitle="Satu sinyal = satu anotasi/kandidat yang tersimpan; bukan jumlah kejadian kriminal atau kebakaran yang sudah terbukti."
        >
          {total === 0 ? (
            <p className="rounded-lg bg-bg p-6 text-sm text-muted">
              Belum ada sinyal tersimpan. Tambahkan anotasi Operator pada
              observasi untuk mulai melihat diagram.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-7">
              <div
                aria-label={`Total ${fmt(total)} sinyal`}
                role="img"
                className="dash-donut relative grid size-44 shrink-0 place-items-center rounded-full"
                style={{ background: gradient }}
              >
                <div className="grid size-28 place-items-center rounded-full bg-white text-center">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">
                      {fmt(total)}
                    </p>
                    <p className="text-[11px] text-muted">sinyal</p>
                  </div>
                </div>
              </div>
              <ul className="min-w-50 flex-1 space-y-2 text-xs">
                {SIGNAL_CLASSES.map((kind) => (
                  <li
                    key={kind}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: SIGNAL_COLORS[kind] }}
                      />
                      {SIGNAL_LABELS[kind]}
                    </span>
                    <strong className="tabular-nums">
                      {fmt(d.signalsByClass[kind])}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
        <Panel
          title="Status pemeriksaan sinyal"
          subtitle="Review ini memvalidasi dukungan bukti atas sinyal; bukan otomatis menyatakan kebakaran atau pelanggaran hukum."
        >
          {(
            [
              ["Belum ditinjau", d.reviews.unreviewed, "#718096"],
              ["Didukung bukti", d.reviews.corroborated, "#238C79"],
              ["Ditolak / false indication", d.reviews.rejected, "#C46E77"],
            ] as const
          ).map(([name, count, color]) => (
            <div key={name} className="mb-5">
              <div className="mb-1.5 flex justify-between text-xs">
                <span>{name}</span>
                <strong className="tabular-nums">{fmt(count)}</strong>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-bg">
                <div
                  className="dash-bar h-full rounded-full"
                  style={{
                    width: `${total ? (count / total) * 100 : 0}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          ))}
        </Panel>
      </div>
      <Panel
        title={`Tren indikasi Januari–Desember ${d.year}`}
        subtitle="Dihitung dari waktu pencatatan sinyal UTC; data kosong tidak diproyeksikan atau diisi otomatis."
      >
        <div className="overflow-x-auto">
          <div
            className="flex h-52 min-w-145 items-end gap-2 border-b border-line pb-2"
            role="img"
            aria-label="Diagram batang tren indikasi bulanan dengan empat kategori"
          >
            {d.months.map((row) => (
              <div
                key={row.month}
                className="group flex h-full flex-1 flex-col justify-end gap-1"
              >
                <div
                  className="flex h-44 items-end justify-center gap-px"
                  title={`${MONTHS[row.month - 1]}: kebakaran ${row.fire_indicator}, chainsaw ${row.chainsaw_like}, tembakan ${row.gunshot_like}, biodiversitas ${row.biodiversity_signal}`}
                >
                  {(
                    [
                      "fire_indicator",
                      "chainsaw_like",
                      "gunshot_like",
                      "biodiversity_signal",
                    ] as const
                  ).map((kind) => (
                    <div
                      key={kind}
                      className="dash-bar w-[22%] min-w-1 rounded-t-sm"
                      style={{
                        height: `${(row[kind] / max) * 100}%`,
                        backgroundColor: SIGNAL_COLORS[kind],
                      }}
                    />
                  ))}
                </div>
                <span className="text-center text-[10px] text-muted">
                  {MONTHS[row.month - 1]}
                </span>
              </div>
            ))}
          </div>
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          {(
            [
              "fire_indicator",
              "chainsaw_like",
              "gunshot_like",
              "biodiversity_signal",
            ] as SignalClass[]
          ).map((kind) => (
            <li key={kind} className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: SIGNAL_COLORS[kind] }}
              />
              {SIGNAL_LABELS[kind]}
            </li>
          ))}
        </ul>
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer font-medium text-brand">
            Tampilkan data tabel yang dapat dibaca
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th className="p-2">Bulan</th>
                  <th className="p-2">Api</th>
                  <th className="p-2">Chainsaw</th>
                  <th className="p-2">Tembakan</th>
                  <th className="p-2">Biodiversitas</th>
                </tr>
              </thead>
              <tbody>
                {d.months.map((row) => (
                  <tr key={row.month} className="border-t border-line">
                    <th className="p-2">{MONTHS[row.month - 1]}</th>
                    <td className="p-2">{row.fire_indicator}</td>
                    <td className="p-2">{row.chainsaw_like}</td>
                    <td className="p-2">{row.gunshot_like}</td>
                    <td className="p-2">{row.biodiversity_signal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Panel>
      <Panel
        title="Bukti sinyal terbaru"
        subtitle="Terbatas pada 10 baris untuk dibaca; seluruh tahun tetap dihitung langsung di database."
      >
        {preview ? (
          <p className="rounded-md bg-bg p-4 text-xs text-muted">
            Mode simulasi tidak menampilkan laporan perorangan atau lokasi
            fiktif.
          </p>
        ) : d.recentSignals.length === 0 ? (
          <p className="rounded-md bg-bg p-4 text-sm text-muted">
            Belum ada sinyal dengan provenance yang tercatat. Jangan
            menyimpulkan tidak ada ancaman di lapangan.
          </p>
        ) : (
          <div className="space-y-3">
            {d.recentSignals.map((signal) => (
              <article
                key={signal.id}
                className="rounded-lg border border-line p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">
                    {SIGNAL_LABELS[signal.signalClass as SignalClass] ??
                      "Sinyal lain"}
                  </strong>
                  <span className="text-xs text-muted">
                    {new Date(signal.createdAt).toLocaleString("id-ID", {
                      timeZone: "Asia/Makassar",
                    })}{" "}
                    WITA
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Sumber:{" "}
                  {signal.evidenceOrigin === "operator_assessment"
                    ? "Anotasi Operator"
                    : "Kandidat model — belum final"}{" "}
                  ·{" "}
                  {signal.reviewStatus === "unreviewed"
                    ? "Belum ditinjau"
                    : signal.reviewStatus === "corroborated"
                      ? "Didukung review"
                      : "Ditolak"}
                </p>
                {signal.modelReference && (
                  <p className="text-xs text-muted">
                    Model: {signal.modelReference}; skor hanya bisa dinilai
                    dengan kalibrasi khusus model.
                  </p>
                )}
                <p className="mt-2 whitespace-pre-wrap text-xs leading-5">
                  {signal.note}
                </p>
                {signal.reviewStatus === "unreviewed" && (
                  <ReviewControl
                    id={signal.id}
                    version={signal.version}
                    organizationId={organizationId}
                  />
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>
      <p className="text-xs leading-5 text-muted">
        {d.caveat} Estimasi cuaca/satelit dan hasil audio tidak dikonversi
        otomatis menjadi kasus kebakaran, perburuan, atau penebangan ilegal.
      </p>
      <style jsx>{`
      @keyframes auvrion-enter {from {opacity:0;transform:translateY(7px)} to {opacity:1;transform:translateY(0)}}
      @keyframes auvrion-sweep {from {opacity:.3;transform:scale(.94)} to {opacity:1;transform:scale(1)}}
      @keyframes auvrion-bar {from {transform:scaleY(0);transform-origin:bottom} to {transform:scaleY(1);transform-origin:bottom}}
      .dash-enter {animation:auvrion-enter 320ms ease-out both}
      .dash-donut {animation:auvrion-sweep 450ms ease-out both}
      .dash-bar {animation:auvrion-bar 420ms ease-out both;transform-origin:bottom}
      @media (prefers-reduced-motion:reduce) {.dash-enter,.dash-donut,.dash-bar {animation:none!important}}
    `}</style>
    </div>
  );
}
