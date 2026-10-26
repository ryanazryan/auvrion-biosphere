"use client";

import { useMemo } from "react";
import { energyRegions } from "./acoustic-activity";

type Props = {
  peaks: number[];
  duration: number;
  onSeek: (seconds: number) => void;
};

/** Real RMS/peak-derived regions, deliberately distinct from Perch candidate timelines. */
export function AcousticActivityTrack({ peaks, duration, onSeek }: Props) {
  const regions = useMemo(
    () => energyRegions(peaks, duration),
    [peaks, duration],
  );
  return (
    <section
      aria-label="Aktivitas akustik berdasarkan energi"
      className="border-t border-white/10 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">Segmen aktivitas akustik</h4>
        <span className="rounded border border-white/20 px-2 py-0.5 text-[11px] text-[#a9c8c1]">
          Energi sinyal · bukan identifikasi spesies
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#a9c8c1]">
        Klik bagian yang intensitasnya meningkat untuk memutar dari waktunya.
        Hujan, angin, mesin, atau suara hewan dapat menghasilkan penanda yang
        sama.
      </p>
      {regions.length ? (
        <fieldset className="relative mt-3 h-11 min-w-0 rounded-md border border-white/15 bg-white/5">
          <legend className="sr-only">Segmen audio berenergi tinggi</legend>
          {regions.map((region) => (
            <button
              type="button"
              key={`${region.startSeconds}-${region.endSeconds}`}
              onClick={() => onSeek(region.startSeconds)}
              title={`Aktivitas audio ${(region.startSeconds).toFixed(1)} sampai ${(region.endSeconds).toFixed(1)} detik`}
              aria-label={`Putar dari ${(region.startSeconds).toFixed(1)} detik; segmen energi, bukan spesies`}
              className="absolute top-1 h-8 rounded-sm bg-[#56bea7]/75 transition hover:bg-[#70dec1] focus-visible:outline-2 focus-visible:outline-white"
              style={{
                left: `${(region.startSeconds / duration) * 100}%`,
                width: `${Math.max(0.8, ((region.endSeconds - region.startSeconds) / duration) * 100)}%`,
              }}
            />
          ))}
        </fieldset>
      ) : (
        <p className="mt-2 rounded border border-dashed border-white/20 p-3 text-xs text-[#a9c8c1]">
          Tidak ditemukan lonjakan energi yang cukup jelas pada rekaman ini. Ini
          tidak membuktikan tidak ada satwa.
        </p>
      )}
      <p className="mt-2 text-[11px] text-[#a9c8c1]">
        {regions.length} segmen energi · heuristik lokal · tidak disimpan ke
        database
      </p>
    </section>
  );
}
