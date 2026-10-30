"use client";

import { useEffect, useRef, useState } from "react";
import { useOperator } from "../../../operator-context";
import {
  type CandidateView,
  type RawInference,
  rankCandidates,
} from "./candidates";
import { SpeciesCandidateCards } from "./SpeciesCandidateCards";

const categoryLabel: Record<CandidateView["category"], string> = {
  species_candidate: "Kandidat nama spesies (belum diverifikasi)",
  general_animal: "Kelompok hewan umum",
  sound_event: "Kategori bunyi / kejadian",
  unclassified: "Label belum dipetakan",
};

type Taxon = {
  name: string;
  key: number;
  kingdom: string | null;
  phylum: string | null;
  className: string | null;
  order: string | null;
  family: string | null;
  genus: string | null;
  species: string | null;
  taxonomicStatus: string;
  sourceUrl: string;
  commonNameIndonesian: string | null;
  commonNameEnglish: string | null;
};
type TaxonLookup = {
  state: "matched" | "unmatched" | "unavailable" | "unsupported";
  taxonomy: Taxon | null;
};

const valueOrUnknown = (value?: string | null) =>
  value?.trim() || "Belum tersedia";
const localTime = (input: string) => {
  const date = new Date(input);
  return Number.isNaN(date.getTime())
    ? "Tidak tersedia"
    : `${date.toLocaleString("id-ID", {
        timeZone: "Asia/Makassar",
        dateStyle: "medium",
        timeStyle: "short",
      })} WITA`;
};

function TaxonomyDetail({
  candidate,
  close,
}: {
  candidate: CandidateView;
  close: () => void;
}) {
  const { operator } = useOperator();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [lookup, setLookup] = useState<TaxonLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
      previous?.focus();
    };
  }, [close]);

  useEffect(() => {
    setLookup(null);
    setError("");
    if (candidate.category !== "species_candidate") return;
    const abort = new AbortController();
    const load = async () => {
      setBusy(true);
      try {
        const params = new URLSearchParams({
          organizationId: operator.organizationId,
          name: candidate.scientificName ?? candidate.label,
        });
        const response = await fetch(`/api/bioacoustics/taxonomy?${params}`, {
          credentials: "same-origin",
          signal: abort.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("GBIF lookup unavailable");
        const body = (await response.json()) as TaxonLookup;
        if (!abort.signal.aborted) setLookup(body);
      } catch {
        if (!abort.signal.aborted)
          setError("Referensi taksonomi belum dapat diambil.");
      } finally {
        if (!abort.signal.aborted) setBusy(false);
      }
    };
    void load();
    return () => abort.abort();
  }, [
    candidate.category,
    candidate.label,
    candidate.scientificName,
    operator.organizationId,
  ]);

  const taxon = lookup?.taxonomy;
  const fields: Array<[string, string]> = [
    ["Label output AI", candidate.label],
    ["Jenis label", categoryLabel[candidate.category]],
    ["Nama umum Indonesia (GBIF)", valueOrUnknown(taxon?.commonNameIndonesian)],
    ["Nama umum Inggris (GBIF)", valueOrUnknown(taxon?.commonNameEnglish)],
    ["Nama ilmiah dalam referensi", valueOrUnknown(taxon?.name)],
    ["Kingdom", valueOrUnknown(taxon?.kingdom)],
    ["Filum", valueOrUnknown(taxon?.phylum)],
    ["Kelas", valueOrUnknown(taxon?.className)],
    ["Ordo", valueOrUnknown(taxon?.order)],
    ["Famili", valueOrUnknown(taxon?.family)],
    ["Genus", valueOrUnknown(taxon?.genus)],
    ["Spesies", valueOrUnknown(taxon?.species)],
    ["Status nama takson", valueOrUnknown(taxon?.taxonomicStatus)],
    ["Kehadiran di Kalimantan", "Belum diuji dengan data distribusi"],
    ["Verifikasi identifikasi audio", "Belum ditinjau manusia"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45">
      <button
        type="button"
        aria-label="Tutup panel taksonomi"
        className="absolute inset-0 cursor-default"
        onClick={close}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="bio-taxonomy-title"
        className="relative z-10 h-full w-full max-w-md overflow-y-auto bg-surface p-5 text-fg shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3
              id="bio-taxonomy-title"
              className="text-lg font-semibold text-ink"
            >
              Detail kandidat & taksonomi
            </h3>
            <p className="mt-1 text-xs text-muted">
              Pencocokan nama ilmiah ≠ bukti bahwa hewan tersebut terekam.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            className="rounded-md border border-line px-3 py-1.5 text-sm"
          >
            Tutup
          </button>
        </div>
        <div
          className="mt-4 rounded-md border border-line bg-bg p-3 text-xs text-muted"
          aria-live="polite"
        >
          {busy
            ? "Mencocokkan label spesies dengan GBIF Taxonomic Backbone..."
            : error
              ? error
              : lookup?.state === "matched"
                ? "Nama cocok persis dengan GBIF pada tingkat spesies. Identifikasi suara tetap belum diverifikasi."
                : candidate.category !== "species_candidate"
                  ? "Label ini bukan nama binomial yang dapat diverifikasi sebagai spesies."
                  : "Tidak ditemukan pencocokan nama spesies yang cukup pasti dalam GBIF."}
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          {fields.map(([label, value]) => (
            <div key={label} className="border-b border-line pb-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 break-words font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {taxon && (
          <a
            href={taxon.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-block text-sm font-medium text-brand underline"
          >
            Lihat referensi nama di GBIF
          </a>
        )}
        <p className="mt-5 rounded-md border border-line bg-bg p-3 text-xs leading-5 text-muted">
          GBIF menjelaskan klasifikasi nama, bukan akurasi Perch. Tidak ada
          probabilitas spesies, distribusi Kalimantan, maupun status konservasi
          yang ditebak.
        </p>
      </section>
    </div>
  );
}

export function BioacousticResultView({
  result,
  analyzing,
  error,
  stored,
  filename,
}: {
  result: RawInference | null;
  analyzing: boolean;
  error: string;
  stored: boolean;
  filename: string | null;
}) {
  const [detail, setDetail] = useState<CandidateView | null>(null);
  const ranked = result ? rankCandidates(result.candidates) : [];
  const biological = ranked.filter(
    (item) =>
      item.category === "species_candidate" ||
      item.category === "general_animal",
  );

  const events = ranked.filter(
    (item) =>
      item.category === "sound_event" || item.category === "unclassified",
  );

  const primary = ranked[0] ?? null;
  const scores = ranked.map((item) => item.modelScore);

  return (
    <section
      aria-label="Hasil analisis bioakustik"
      className="space-y-3 border-t border-line pt-4"
      aria-busy={analyzing}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-ink">
            Analisis suara Perch 2.0
          </h3>
          <p className="mt-1 text-xs text-muted">
            Kandidat dari Perch 2.0; model belum dikalibrasi untuk spesies
            Kalimantan
          </p>
        </div>
        <span className="rounded border border-line px-2 py-1 text-xs text-muted">
          {result
            ? "Selesai · belum diverifikasi"
            : analyzing
              ? "Sedang menganalisis"
              : "Belum ada hasil"}
        </span>
      </div>
      {!result && (
        <div
          className="rounded-md border border-dashed border-line p-5 text-sm text-muted"
          role="status"
        >
          {analyzing
            ? "Perch 2.0 sedang melakukan inferensi audio sungguhan..."
            : error
              ? `Analisis gagal: ${error}`
              : stored
                ? "WAV tersimpan. Belum ada hasil inferensi pada sesi ini."
                : "Unggah WAV atau rekam mikrofon, lalu mulai analisis."}
        </div>
      )}
      {result && (
        <>
          <div className="grid gap-4 rounded-lg border border-line bg-bg/60 p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(12rem,.8fr)]">
            <div>
              <p className="text-xs font-semibold text-brand">
                Label dengan skor tertinggi
              </p>
              <h4 className="mt-2 text-xl font-semibold text-ink">
                {primary?.category === "species_candidate"
                  ? primary.displayName
                  : "Spesies belum dapat ditentukan"}
              </h4>
              <p className="mt-1 text-sm text-muted">
                {primary?.category === "species_candidate"
                  ? "Ini hanya kecocokan label berdasarkan suara. Tidak membuktikan bahwa spesies tersebut ada dalam rekaman."
                  : "Model belum memberikan identitas spesies yang bisa diinterpretasikan dengan aman."}
              </p>
              {primary && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded border border-line bg-surface px-2 py-1">
                    Label: {primary.displayName}
                  </span>
                  <span className="rounded border border-line bg-surface px-2 py-1">
                    {categoryLabel[primary.category]}
                  </span>
                </div>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-md border border-line bg-surface p-3 text-xs">
              <div>
                <dt className="text-muted">Skor mentah</dt>
                <dd className="mt-1 font-mono text-base font-semibold text-ink">
                  {primary ? primary.modelScore.toFixed(6) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="mt-1 font-semibold">Belum diverifikasi</dd>
              </div>
              <div>
                <dt className="text-muted">Nama pada model</dt>
                <dd className="mt-1 break-words font-semibold">
                  {primary?.label ?? "Tidak tersedia"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Model</dt>
                <dd className="mt-1 font-semibold">Google Perch 2.0</dd>
              </div>
            </dl>
          </div>
          <p className="rounded-md border border-line bg-bg px-3 py-3 text-xs leading-5 text-muted">
            Jika kamu mengetahui label rujukan rekaman dan kandidat teratas
            berbeda, catat sebagai ketidaksesuaian model. Jangan mengubah hasil
            AI menjadi nama satwa yang diharapkan tanpa evaluasi berlabel yang
            sah.
          </p>
          {biological.length > 0 && (
            <div className="overflow-hidden rounded-md border border-line">
              <div className="border-b border-line px-3 py-3">
                <h4 className="font-semibold text-ink">Kandidat biologis</h4>
                <p className="mt-1 text-xs text-muted">
                  Batang hanya membandingkan skor kandidat sesi ini; bukan
                  peluang spesies atau persentase keyakinan.
                </p>
              </div>
              <SpeciesCandidateCards
                candidates={biological}
                scores={scores}
                onDetail={setDetail}
              />
            </div>
          )}
          {events.length > 0 && (
            <div className="rounded-md border border-line bg-bg p-3">
              <h4 className="font-semibold text-ink">
                Peristiwa akustik (bukan takson)
              </h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {events.map((item) => (
                  <span
                    key={`${item.label}-${item.modelScore}`}
                    className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
                  >
                    {item.displayName} · {item.modelScore.toFixed(4)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-md border border-line bg-bg p-3 text-xs text-muted">
            <strong className="text-ink">Skor Perch belum dikalibrasi.</strong>{" "}
            Angka menunjukkan peringkat model, bukan persen akurasi atau
            probabilitas spesies. Detail taksonomi menggunakan GBIF hanya jika
            nama cocok persis.
          </div>
          <details className="rounded-md border border-line px-3 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Detail teknis & provenans
            </summary>
            <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
              {(
                [
                  ["Audio", filename || "Tidak tersedia"],
                  ["Model", `${result.provider} · ${result.modelId}`],
                  ["Versi", result.modelVersion],
                  ["Status", result.status],
                  ["Analisis", localTime(result.analyzedAt)],
                  ["Evidence media ID", result.mediaId],
                  ["Audio SHA-256", result.audioSha256],
                  [
                    "Hasil AI",
                    result.persistence === "stored_unverified"
                      ? "Snapshot kandidat tersimpan; belum diverifikasi"
                      : "Sementara; belum disimpan permanen",
                  ],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted">{label}</dt>
                  <dd className="mt-1 break-all font-mono text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </details>
          <div className="rounded-md border border-line p-3">
            <h4 className="font-semibold text-ink">Peninjauan manusia</h4>
            <p className="mt-1 text-xs leading-5 text-muted">
              Dengarkan rekaman, cocokkan dengan referensi suara dan konteks
              ekologis. Pencocokan nama di GBIF tidak mengesahkan deteksi dan
              tidak mengubah observasi.
            </p>
          </div>
        </>
      )}
      {detail && (
        <TaxonomyDetail candidate={detail} close={() => setDetail(null)} />
      )}
    </section>
  );
}
