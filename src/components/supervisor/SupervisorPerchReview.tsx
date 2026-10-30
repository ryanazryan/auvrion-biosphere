"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type CandidateView,
  type RawCandidate,
  rankCandidates,
  relativeBar,
} from "@/figma-operator/screens/operator/bioacoustic-v2/candidates";

type StoredAnalysis = {
  status: "succeeded" | "no_candidates";
  verification: "unverified";
  provider: string;
  modelId: string;
  modelVersion: string;
  candidates: RawCandidate[];
  mediaId: string;
  audioSha256: string;
  analyzedAt: string;
  persistence: "stored_unverified";
};

type Taxonomy = {
  name: string;
  genus: string | null;
  family: string | null;
  commonNameIndonesian: string | null;
  commonNameEnglish: string | null;
  sourceUrl: string;
  photo: {
    url: string;
    sourceUrl: string;
    license: string;
    attribution: string;
  } | null;
};

type Lookup = {
  state: "matched" | "unmatched" | "unavailable" | "unsupported";
  taxonomy: Taxonomy | null;
};

function CandidateRow({
  candidate,
  rank,
  scores,
  taxonomyBase,
}: {
  candidate: CandidateView;
  rank: number;
  scores: number[];
  taxonomyBase: string;
}) {
  const speciesName =
    candidate.category === "species_candidate"
      ? (candidate.scientificName ?? candidate.label)
      : null;
  const [reference, setReference] = useState<Lookup | null>(null);
  const [referenceError, setReferenceError] = useState("");
  const [loading, setLoading] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  const loadReference = useCallback(async () => {
    activeRequest.current?.abort();

    const controller = new AbortController();
    activeRequest.current = controller;

    setReference(null);
    setReferenceError("");

    if (!speciesName) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams({
        name: speciesName,
      });

      const response = await fetch(`${taxonomyBase}?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Referensi taksonomi gagal dimuat (HTTP ${response.status}).`,
        );
      }

      const body = (await response.json()) as Lookup;

      if (!controller.signal.aborted) {
        setReference(body);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setReferenceError(
          error instanceof Error
            ? error.message
            : "Referensi taksonomi gagal dimuat.",
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [speciesName, taxonomyBase]);

  useEffect(() => {
    void loadReference();

    return () => {
      activeRequest.current?.abort();
    };
  }, [loadReference]);

  const taxon = reference?.state === "matched" ? reference.taxonomy : null;
  const photo = taxon?.photo;
  const displayName =
    taxon?.commonNameIndonesian ??
    taxon?.commonNameEnglish ??
    candidate.displayName;
  const hasCommonName = Boolean(
    taxon?.commonNameIndonesian || taxon?.commonNameEnglish,
  );
  const scientificName = taxon?.name ?? speciesName;

  return (
    <li className="grid gap-3 border-b border-line p-3 last:border-b-0 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(7rem,.5fr)] sm:items-center">
      <div className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-md border border-line bg-bg sm:w-24">
        {photo ? (
          <Image
            src={photo.url}
            alt={`Foto referensi ${displayName}, bukan bukti sumber rekaman`}
            width={192}
            height={192}
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="px-2 text-center text-xs text-muted">
            {loading ? "Memuat referensi…" : "Foto tidak tersedia"}
          </span>
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-xs text-muted">
          Kandidat #{rank} ·{" "}
          {candidate.category === "species_candidate"
            ? "Nama spesies"
            : "Label umum"}
        </p>
        <p className="break-words font-semibold text-ink">{displayName}</p>
        {scientificName && hasCommonName && (
          <p className="text-xs italic text-muted">{scientificName}</p>
        )}
        <p className="text-xs text-muted">
          {taxon
            ? `Genus ${taxon.genus ?? "—"} · Famili ${taxon.family ?? "—"}`
            : candidate.category === "species_candidate"
              ? "Nama umum belum tersedia dari referensi"
              : "Bukan identifikasi spesies tertentu"}
        </p>
        {photo && (
          <a
            href={photo.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block break-words text-xs text-brand underline"
          >
            Sumber foto · {photo.license} · {photo.attribution}
          </a>
        )}
        {referenceError && (
          <div className="text-xs text-amber-800" role="status">
            {referenceError}{" "}
            <button
              type="button"
              className="font-medium underline"
              onClick={() => void loadReference()}
            >
              Coba lagi
            </button>
          </div>
        )}
        {!loading && !referenceError && reference?.state === "unmatched" && (
          <p className="text-xs text-muted">
            Nama tidak cocok persis dengan referensi GBIF.
          </p>
        )}
        <p className="text-xs text-muted">
          Kandidat AI · belum diverifikasi manusia
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="h-1.5 overflow-hidden rounded-full bg-bg">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${relativeBar(candidate.modelScore, scores)}%` }}
          />
        </div>
        <span className="text-right font-mono text-xs text-muted">
          Skor mentah {candidate.modelScore.toFixed(4)}
        </span>
        <details className="rounded-md border border-line px-3 py-2 text-xs text-ink">
          <summary className="cursor-pointer text-center">
            Detail taksonomi
          </summary>
          <div className="mt-3 space-y-1 border-t border-line pt-2 text-muted">
            <p>Nama ilmiah: {scientificName ?? "Tidak tersedia"}</p>
            <p>Genus: {taxon?.genus ?? "Belum tersedia"}</p>
            <p>Famili: {taxon?.family ?? "Belum tersedia"}</p>
            <p>Status: kandidat model, bukan identifikasi terverifikasi.</p>
            {taxon && (
              <a
                href={taxon.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block break-words text-brand underline"
              >
                Referensi GBIF
              </a>
            )}
          </div>
        </details>
      </div>
    </li>
  );
}

/** Read-only: the Supervisor sees the Operator's stored result; no Perch POST. */
export function SupervisorPerchReview({
  caseId,
  observationId,
}: {
  caseId: string;
  observationId: string;
}) {
  const base = `/api/supervisor/cases/${encodeURIComponent(caseId)}/observations/${encodeURIComponent(observationId)}`;
  const [result, setResult] = useState<StoredAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`${base}/bioacoustics`, {
          credentials: "same-origin",
          cache: "no-store",
          signal,
        });
        if (!response.ok) {
          throw new Error(
            `Tidak dapat membaca hasil Operator (HTTP ${response.status}).`,
          );
        }
        const body = (await response.json()) as {
          result: StoredAnalysis | null;
        };
        if (!signal?.aborted) {
          setResult(body.result);
          setError("");
        }
      } catch (cause) {
        if (!signal?.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Gagal membaca hasil Perch.",
          );
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [base],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const ranked = useMemo(
    () => rankCandidates(result?.candidates ?? []),
    [result?.candidates],
  );
  const biological = ranked.filter(
    (candidate) => candidate.category !== "sound_event",
  );
  const events = ranked.filter(
    (candidate) => candidate.category === "sound_event",
  );
  const scores = ranked.map((candidate) => candidate.modelScore);

  return (
    <section
      aria-label="Kandidat biologis Perch yang diteruskan oleh Operator"
      className="mt-4 rounded-2xl border border-line bg-white p-4 sm:p-5"
      aria-busy={loading}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            Hasil Perch 2.0 dari Operator
          </h3>
          <p className="mt-1 text-xs text-muted">
            Snapshot analisis WAV tersimpan; Supervisor tidak menjalankan
            inferensi ulang.
          </p>
        </div>
        {result && (
          <span className="rounded-full bg-bg px-2.5 py-1 text-[11px] text-muted">
            Belum diverifikasi
          </span>
        )}
      </div>

      {loading && (
        <p className="mt-4 text-xs text-muted">
          Memuat hasil analisis Operator…
        </p>
      )}
      {!loading && error && (
        <p
          className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}
      {!loading && !error && !result && (
        <p className="mt-4 rounded-lg bg-bg px-4 py-3 text-xs text-muted">
          Belum ada hasil Perch tersimpan untuk observasi ini. Operator perlu
          menganalisis dan menyimpan WAV yang benar terlebih dahulu.
        </p>
      )}
      {!loading && result && (
        <>
          <div className="mt-4 flex flex-wrap gap-3 border-b border-line pb-3 text-xs text-muted">
            <span>
              {result.provider} · {result.modelId}
            </span>
            <span>{result.candidates.length} kandidat</span>
            <span>
              Analisis:{" "}
              {new Date(result.analyzedAt).toLocaleString("id-ID", {
                timeZone: "Asia/Makassar",
              })}{" "}
              WITA
            </span>
          </div>
          {biological.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-md border border-line">
              <div className="border-b border-line px-3 py-3">
                <h4 className="font-semibold text-ink">Kandidat biologis</h4>
                <p className="mt-1 text-xs text-muted">
                  Batang hanya membandingkan skor dalam satu analisis; bukan
                  persentase keyakinan.
                </p>
              </div>
              <ol className="divide-y divide-line">
                {biological.map((candidate, index) => (
                  <CandidateRow
                    key={`${candidate.label}-${candidate.modelScore}-${candidate.startMs ?? "na"}-${candidate.endMs ?? "na"}`}
                    candidate={candidate}
                    rank={index + 1}
                    scores={scores}
                    taxonomyBase={`${base}/taxonomy`}
                  />
                ))}
              </ol>
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted">
              Tidak ada kandidat biologis pada snapshot ini.
            </p>
          )}
          {events.length > 0 && (
            <div className="mt-4 rounded-lg border border-line bg-bg p-3 text-xs text-muted">
              <strong className="text-ink">Peristiwa akustik</strong>
              {events.map((candidate) => (
                <p key={`${candidate.label}-${candidate.modelScore}`}>
                  {candidate.displayName} · skor mentah{" "}
                  {candidate.modelScore.toFixed(4)}
                </p>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-muted">
            Hasil Perch belum dikalibrasi untuk spesies Kalimantan. Skor mentah
            bukan probabilitas atau kepastian deteksi. Foto berasal dari
            referensi taksonomi, bukan dari lokasi perekaman.
          </p>
          <details className="mt-3 rounded-lg border border-line px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-ink">
              Provenans hasil Operator
            </summary>
            <dl className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
              <div>
                <dt>Model</dt>
                <dd className="text-ink">
                  {result.modelId} · {result.modelVersion}
                </dd>
              </div>
              <div>
                <dt>Media ID</dt>
                <dd className="break-all text-ink">{result.mediaId}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt>Audio SHA-256</dt>
                <dd className="break-all font-mono text-ink">
                  {result.audioSha256}
                </dd>
              </div>
            </dl>
          </details>
        </>
      )}
    </section>
  );
}
