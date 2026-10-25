"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useOperator } from "../../../operator-context";
import { type CandidateView, relativeBar } from "./candidates";

type Reference = {
  name: string;
  commonNameIndonesian: string | null;
  commonNameEnglish: string | null;
  family: string | null;
  genus: string | null;
  sourceUrl: string;
  photo: null | {
    url: string;
    attribution: string;
    license: string;
    sourceUrl: string;
  };
};
type Lookup = {
  state: "matched" | "unmatched" | "unavailable" | "unsupported";
  taxonomy: Reference | null;
};

function SpeciesCard({
  candidate,
  rank,
  scores,
  onDetail,
}: {
  candidate: CandidateView;
  rank: number;
  scores: number[];
  onDetail: (candidate: CandidateView) => void;
}) {
  const { operator } = useOperator();
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [loading, setLoading] = useState(
    candidate.category === "species_candidate",
  );

  useEffect(() => {
    setLookup(null);
    if (candidate.category !== "species_candidate") {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const parameters = new URLSearchParams({
      organizationId: operator.organizationId,
      name: candidate.scientificName ?? candidate.label,
    });
    setLoading(true);
    fetch(`/api/bioacoustics/taxonomy?${parameters}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("REFERENCE_UNAVAILABLE");
        return (await response.json()) as Lookup;
      })
      .then((data) => {
        if (!controller.signal.aborted) setLookup(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLookup(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    candidate.category,
    candidate.label,
    candidate.scientificName,
    operator.organizationId,
  ]);

  const taxon = lookup?.state === "matched" ? lookup.taxonomy : null;
  const displayName =
    taxon?.commonNameIndonesian ??
    taxon?.commonNameEnglish ??
    candidate.displayName;
  const hasCommonName = Boolean(
    taxon?.commonNameIndonesian || taxon?.commonNameEnglish,
  );
  const photo = taxon?.photo;

  return (
    <li className="grid gap-3 border-b border-line p-3 last:border-b-0 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(7rem,.5fr)] sm:items-center">
      <div className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-md border border-line bg-bg sm:w-24">
        {photo ? (
          <Image
            src={photo.url}
            alt={`Foto referensi ${displayName}; bukan bukti sumber rekaman`}
            width={192}
            height={192}
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="px-2 text-center text-xs text-muted">
            {loading ? "Memuat referensi..." : "Foto tidak tersedia"}
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
        {hasCommonName && (
          <p className="text-xs italic text-muted">{taxon?.name}</p>
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
            className="inline-block text-xs text-brand underline"
          >
            Sumber foto · {photo.license} · {photo.attribution}
          </a>
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
        <button
          type="button"
          onClick={() => onDetail(candidate)}
          className="rounded-md border border-line px-3 py-2 text-xs hover:bg-bg"
        >
          Detail taksonomi
        </button>
      </div>
    </li>
  );
}

export function SpeciesCandidateCards({
  candidates,
  scores,
  onDetail,
}: {
  candidates: CandidateView[];
  scores: number[];
  onDetail: (candidate: CandidateView) => void;
}) {
  return (
    <ol className="divide-y divide-line">
      {candidates.map((candidate, index) => (
        <SpeciesCard
          key={`${candidate.label}-${candidate.modelScore}`}
          candidate={candidate}
          rank={index + 1}
          scores={scores}
          onDetail={onDetail}
        />
      ))}
    </ol>
  );
}
