"use client";

import Link from "next/link";
import { ObservationLocationMap } from "./ObservationLocationMap";

type Props = {
  organizationId: string;
  observationId: string;
  domain: "biodiversity" | "environmental_risk";
  hasCoordinates: boolean;
  unknownReason: string | null;
  acquisitionMethod: string | null;
  sourceMethod: string | null;
  sourceCode: string;
};

/** Explicitly distinguish device deployment from observation/incident location. */
export function ObservationLocationSummary({
  organizationId,
  observationId,
  domain,
  hasCoordinates,
  unknownReason,
  acquisitionMethod,
  sourceMethod,
  sourceCode,
}: Props) {
  const sourceType = `${acquisitionMethod ?? ""} ${sourceMethod ?? ""}`;
  const listen = /listen_device|listen_device_wav/i.test(sourceType);
  const prevent = /prevent_device|visual_device/i.test(sourceType);
  const fromDevice = listen || prevent;
  const deviceName = listen ? "LISTEN" : prevent ? "PREVENT" : "IoT";

  return (
    <div className="min-w-0 space-y-4">
      {fromDevice ? (
        <section className="rounded-lg border border-line bg-bg/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ink">
              Lokasi perangkat {deviceName}
            </h3>
            <span className="rounded border border-line bg-white px-2 py-0.5 text-[11px] text-muted">
              Belum didaftarkan
            </span>
          </div>
          <p className="mt-2 break-all font-mono text-[11px] text-muted">
            {sourceCode}
          </p>
          <p className="mt-3 text-xs leading-5 text-muted">
            Sistem belum menyimpan koordinat pemasangan perangkat terpisah dari
            titik observasi. Posisi perangkat tidak boleh ditebak dari lokasi
            kejadian.
          </p>
          {listen && (
            <Link
              href="/operator/listen"
              className="mt-3 inline-flex text-xs font-medium text-brand hover:underline"
            >
              Lihat perangkat di Jaringan LISTEN
            </Link>
          )}
        </section>
      ) : null}

      {domain === "environmental_risk" ? (
        <section className="rounded-lg border border-line bg-bg/50 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ink">
              Titik observasi / kejadian
            </h3>
            <span className="rounded border border-line bg-white px-2 py-0.5 text-[11px] text-muted">
              {hasCoordinates ? "Tersimpan" : "Tidak diketahui"}
            </span>
          </div>
          {hasCoordinates ? (
            <>
              <p className="mt-2 text-xs leading-5 text-muted">
                Koordinat ini berasal dari catatan observasi, termasuk input
                lintang-bujur atau pin Operator. Bukan otomatis posisi
                perangkat.
              </p>
              <ObservationLocationMap
                organizationId={organizationId}
                observationId={observationId}
              />
            </>
          ) : (
            <p className="mt-2 text-xs leading-5 text-muted">
              {unknownReason ?? "Titik belum dicatat."}
            </p>
          )}
        </section>
      ) : (
        <section className="rounded-lg border border-line bg-bg/50 p-4">
          <h3 className="text-[13px] font-semibold text-ink">
            Lokasi pengamatan biodiversitas
          </h3>
          <p className="mt-2 text-xs leading-5 text-muted">
            {hasCoordinates
              ? "Titik pengamatan tersimpan dengan akses koordinat presisi terbatas oleh kebijakan biodiversitas."
              : (unknownReason ??
                "Koordinat pengamatan tidak dicatat untuk observasi ini.")}
          </p>
        </section>
      )}
    </div>
  );
}
