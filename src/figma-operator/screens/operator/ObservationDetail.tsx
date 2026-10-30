"use client";

import Link from "next/link";
import { useCallback } from "react";
import { ObservationLocationSummary } from "@/components/gis/ObservationLocationSummary";
import { ObservationSignalForm } from "@/components/operator/ObservationSignalForm";
import { EnvironmentalAdvisory } from "@/figma-operator/demo/EnvironmentalAdvisory";
import { openOperatorAssistant } from "@/figma-operator/demo/OperatorAssistant";
import { formatReadableDateTime } from "@/figma-operator/gis/format-readable-date";
import { formatMeasurementValue } from "@/figma-operator/gis/observation-evidence-display";

import { OperatorLayout } from "../../components/operator/OperatorLayout";
import {
  DomainLabel,
  ErrorState,
  KV,
  LoadingRows,
  Mono,
  Panel,
  QualityBadge,
  Unknown,
  useQuery,
} from "../../components/operator/parts";
import { BackLink } from "../../components/ui";
import {
  getObservation,
  KINDS,
  type MeasurementKind,
  MODE,
  type Observation,
  QUALITY,
  sourceById,
} from "../../observations";
import { useOperator } from "../../operator-context";

import { BioacousticAnalysisPanel } from "./BioacousticAnalysisPanel";
import { lastListHref } from "./Observations";
import { resolveObservationSourceCode } from "./observation-source";

export function ObservationDetail({ id }: { id: string }) {
  const { operator } = useOperator();

  const load = useCallback(
    () => getObservation(id, operator.organizationId),
    [id, operator.organizationId],
  );

  const query = useQuery(load);

  return (
    <OperatorLayout
      path={`/operator/observations/${id}`}
      crumbs={[{ label: "Observasi", href: lastListHref }, { label: id }]}
    >
      <div className="mb-5">
        <BackLink href={lastListHref}>Kembali ke daftar observasi</BackLink>
      </div>

      {query.status === "error" ? (
        <ErrorState error={query.error} retry={query.retry} />
      ) : query.status === "loading" ? (
        <div className="rounded-lg border border-line bg-surface">
          <LoadingRows rows={6} label="Memuat detail observasi" />
        </div>
      ) : (
        <ObservationBody observation={query.data} />
      )}
    </OperatorLayout>
  );
}

function ObservationBody({ observation: o }: { observation: Observation }) {
  const { sources, timeZone } = useOperator();

  const source = sourceById(o.sourceId, sources);

  const sourceCode = resolveObservationSourceCode(source?.code, o.sourceCode);

  const observationTitle =
    o.domain === "environmental_risk"
      ? "Observasi Risiko Lingkungan"
      : "Observasi Biodiversitas";

  const isSimulation = o.ingestionMode === "simulation";

  const unknowns: string[] = [];

  if (!o.observedAt) {
    unknowns.push("Waktu observasi tidak diketahui.");
  }

  if (!o.location.hasCoordinates) {
    unknowns.push("Lokasi observasi tidak diketahui.");
  }

  if (!o.provenance.licenseNote) {
    unknowns.push("Catatan lisensi belum dicantumkan oleh sumber.");
  }

  if (o.provenance.limitations.length === 0) {
    unknowns.push("Keterbatasan sumber belum dicatat.");
  }

  if (o.ingestionMode === "historical") {
    unknowns.push("Data historis tidak menunjukkan kondisi terkini.");
  }

  if (o.domain === "environmental_risk") {
    unknowns.push(
      "Pengukuran lingkungan tidak mengonfirmasi adanya kebakaran.",
    );
  }

  if (o.domain === "biodiversity") {
    unknowns.push("Identifikasi spesies memerlukan verifikasi manusia.");
  }

  if (source && !source.active) {
    unknowns.push("Sumber data sudah tidak aktif.");
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="border-b border-line pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <DomainLabel d={o.domain} />

              <QualityBadge q={o.quality} />

              {isSimulation && (
                <span className="rounded-md border border-line bg-bg px-2 py-0.5 text-xs font-medium text-muted">
                  Simulasi
                </span>
              )}

              {o.ingestionMode === "historical" && (
                <span className="rounded-md border border-line bg-bg px-2 py-0.5 text-xs text-muted">
                  Historis
                </span>
              )}
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {observationTitle}
            </h1>
            {!isSimulation &&
              o.quality !== "invalid" &&
              sourceCode !== "WC009-MANUAL-DEV" && (
                <Link
                  href="/operator/review/new"
                  className="inline-flex rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  Buat Case untuk Supervisor
                </Link>
              )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                Sumber:{" "}
                <strong className="font-medium text-fg">{sourceCode}</strong>
              </span>

              {o.observedAt && (
                <span>
                  Diamati: {formatReadableDateTime(o.observedAt, timeZone)}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span>ID Observasi</span>

              <Mono className="break-all text-fg">{o.id}</Mono>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              openOperatorAssistant(
                o.domain === "biodiversity" ? "observation" : "environment",
                o.id,
                [
                  { label: "Sumber", value: o.sourceCode },
                  {
                    label: "Kualitas",
                    value: QUALITY[o.quality].label,
                  },
                ],
                "Jelaskan observasi ini",
              )
            }
            className="rounded-md border border-line bg-white px-3 py-2 text-[13px] font-medium text-brand hover:bg-brand-50"
          >
            Tanya AI
          </button>
        </div>
      </header>

      {/* Ringkasan utama */}
      <section
        aria-label="Ringkasan observasi"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4"
      >
        <SummaryStat
          label="Domain"
          value={
            o.domain === "environmental_risk"
              ? "Risiko lingkungan"
              : "Biodiversitas"
          }
        />

        <SummaryStat label="Sumber" value={sourceCode} />

        <SummaryStat label="Pengukuran" value={String(o.measurements.length)} />

        <SummaryStat label="Kualitas" value={QUALITY[o.quality].label} />
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          {/* Detail sumber */}
          <Panel title="Sumber dan waktu">
            <dl>
              <KV k="Sumber data">
                {source ? (
                  <>
                    {source.name}
                    <Mono className="ml-2 text-muted">({source.code})</Mono>
                    {!source.active && (
                      <span className="ml-2 text-xs text-warn">Nonaktif</span>
                    )}
                  </>
                ) : (
                  <Mono>{o.sourceCode}</Mono>
                )}
              </KV>

              <KV k="ID rekaman sumber">
                <div className="min-w-0">
                  <Mono>{o.sourceRecordId}</Mono>

                  <p className="mt-1 text-xs text-muted">
                    Identitas entri pada sumber data, bukan selalu berkas
                    rekaman audio.
                  </p>
                </div>
              </KV>

              <KV k="Mode ingesti">
                <span>{MODE[o.ingestionMode]}</span>
              </KV>

              <KV k="Waktu observasi">
                {o.observedAt ? (
                  <Mono>{formatReadableDateTime(o.observedAt, timeZone)}</Mono>
                ) : (
                  <div>
                    <Unknown>Tidak diketahui</Unknown>
                    <p className="mt-1 text-xs text-muted">
                      {o.unknownObservedTimeReason}
                    </p>
                  </div>
                )}
              </KV>

              <KV k="Waktu diterima">
                <Mono>{formatReadableDateTime(o.receivedAt, timeZone)}</Mono>
              </KV>
            </dl>
          </Panel>

          {/* Pengukuran lebih menonjol */}
          {o.domain === "environmental_risk" && (
            <Panel
              title="Pengukuran lingkungan"
              aside={
                <span className="text-xs text-muted">
                  {o.measurements.length} pengukuran
                </span>
              }
            >
              {o.measurements.length === 0 ? (
                <p className="text-sm text-muted">
                  Belum ada pengukuran yang dicatat.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {o.measurements.map((m) => (
                      <div
                        key={`${m.kind}:${m.measuredAt ?? "unknown"}:${m.measuredValue}:${m.unit}`}
                        className="rounded-lg border border-line bg-bg/50 p-3.5"
                      >
                        <p className="text-xs font-medium text-muted">
                          {KINDS[m.kind as MeasurementKind]?.label ?? m.kind}
                        </p>

                        <p className="mt-2 text-xl font-semibold tabular-nums text-ink">
                          {formatMeasurementValue(m.measuredValue)}{" "}
                          <span className="text-sm font-medium text-muted">
                            {m.unit}
                          </span>
                        </p>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                          {m.quality ? (
                            <QualityBadge q={m.quality} />
                          ) : (
                            <Unknown>Kualitas belum tersedia</Unknown>
                          )}
                        </div>

                        <p className="mt-2 text-xs text-muted">
                          {m.measuredAt
                            ? formatReadableDateTime(m.measuredAt, timeZone)
                            : "Waktu ukur tidak dicatat"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          )}

          {/* Konteks eksternal */}
          {o.domain === "environmental_risk" && (
            <EnvironmentalAdvisory
              observationId={o.id}
              sourceSummary={`${sourceCode} · ${
                o.provenance.acquisitionMethod ?? "Metode tidak diketahui"
              } · ${MODE[o.ingestionMode]}`}
              measurements={o.measurements.map((m) => ({
                label: KINDS[m.kind as MeasurementKind]?.label ?? m.kind,
                value: formatMeasurementValue(m.measuredValue),
                unit: m.unit,
              }))}
            />
          )}

          {/* Analisis biodiversitas */}
          {o.domain === "biodiversity" && (
            <Panel title="Analisis bioakustik">
              <BioacousticAnalysisPanel observationId={o.id} />
            </Panel>
          )}

          <Panel title="Indikasi lapangan (anotasi manusia)">
            <ObservationSignalForm
              observationId={o.id}
              organizationId={o.organizationId}
            />
          </Panel>

          {/* Provenans */}
          <Panel title="Provenans">
            <dl>
              <KV k="Atribusi">{o.provenance.attribution}</KV>

              <KV k="Metode akuisisi">
                <span className="text-fg">
                  {o.provenance.acquisitionMethod ?? "Tidak diketahui"}
                </span>
              </KV>

              <KV k="Catatan lisensi">
                {o.provenance.licenseNote ? (
                  o.provenance.licenseNote
                ) : (
                  <Unknown>Tidak dicantumkan oleh sumber</Unknown>
                )}
              </KV>

              <KV k="Keterbatasan">
                {o.provenance.limitations.some(
                  (item) => item.trim() && item.trim() !== "-",
                ) ? (
                  <ul className="list-disc space-y-1 pl-4">
                    {o.provenance.limitations
                      .filter((item) => item.trim() && item.trim() !== "-")
                      .map((limitation) => (
                        <li key={limitation}>{limitation}</li>
                      ))}
                  </ul>
                ) : (
                  <Unknown>Belum ada keterbatasan yang dicatat</Unknown>
                )}
              </KV>
            </dl>
          </Panel>
        </div>

        {/* Sidebar */}
        <aside className="min-w-0 space-y-5">
          <Panel title="Kualitas data">
            <div className="space-y-3">
              <QualityBadge q={o.quality} />

              <p className="text-[13px] leading-5 text-muted">
                {QUALITY[o.quality].desc}
              </p>
              <p className="border-t border-line pt-3 text-xs leading-5 text-muted">
                Mode data: {MODE[o.ingestionMode]}. Peninjauan Case dan indikasi
                tidak otomatis mengubah kualitas pengukuran atau hasil audio.
              </p>
              {o.quality === "unreviewed" && (
                <a
                  href="/operator/review"
                  className="inline-block text-xs font-medium text-brand hover:underline"
                >
                  Buka antrean review
                </a>
              )}
            </div>
          </Panel>

          <Panel title="Lokasi">
            <ObservationLocationSummary
              organizationId={o.organizationId}
              observationId={o.id}
              domain={o.domain}
              hasCoordinates={o.location.hasCoordinates}
              unknownReason={o.location.unknownReason}
              acquisitionMethod={o.provenance.acquisitionMethod}
              sourceMethod={source?.acquisitionMethod ?? null}
              sourceCode={sourceCode}
            />
          </Panel>

          <Panel title="Catatan data">
            {unknowns.length > 0 ? (
              <ul className="space-y-3">
                {unknowns.map((message) => (
                  <li
                    key={message}
                    className="flex items-start gap-2 text-xs leading-5 text-muted"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-muted"
                    />

                    <span>{message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">Tidak ada catatan tambahan.</p>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-white px-4 py-3.5">
      <p className="text-[11px] font-medium text-muted">{label}</p>

      <p className="mt-1 truncate text-[13px] font-semibold text-ink">
        {value}
      </p>
    </div>
  );
}
