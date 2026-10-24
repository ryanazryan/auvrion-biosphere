"use client";

import { useCallback } from "react";
import { EnvironmentalAdvisory } from "@/figma-operator/demo/EnvironmentalAdvisory";
import { openOperatorAssistant } from "@/figma-operator/demo/OperatorAssistant";
import * as I from "../../components/icons";
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
  fmtTs,
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
  const { operator: OPERATOR } = useOperator();
  const load = useCallback(
    () => getObservation(id, OPERATOR.organizationId),
    [id, OPERATOR.organizationId],
  );
  const q = useQuery(load);
  return (
    <OperatorLayout
      path={`/operator/observations/${id}`}
      crumbs={[{ label: "Observasi", href: lastListHref }, { label: id }]}
    >
      <div className="mb-4">
        <BackLink href={lastListHref}>Kembali ke daftar observasi</BackLink>
      </div>
      {q.status === "error" ? (
        <ErrorState error={q.error} retry={q.retry} />
      ) : q.status === "loading" ? (
        <div className="rounded-md border border-line bg-surface">
          <LoadingRows rows={6} label="Memuat detail observasi" />
        </div>
      ) : (
        <Body o={q.data} />
      )}
    </OperatorLayout>
  );
}

function Body({ o }: { o: Observation }) {
  const { sources: SOURCES, timeZone } = useOperator();
  const src = sourceById(o.sourceId, SOURCES);
  const unknowns: string[] = [];
  if (!o.observedAt) unknowns.push("Waktu observasi tidak diketahui.");
  if (!o.location.hasCoordinates) unknowns.push("Lokasi tidak diketahui.");
  if (!o.provenance.licenseNote)
    unknowns.push("Catatan lisensi tidak dicantumkan sumber.");
  if (o.provenance.limitations.length === 0)
    unknowns.push(
      "Sumber tidak mencatat keterbatasan; bukan berarti data bebas keterbatasan.",
    );
  if (o.domain === "biodiversity")
    unknowns.push(
      "Identifikasi spesies belum diverifikasi; status audio tercatat pada panel Analisis Bioakustik.",
    );
  if (o.domain === "environmental_risk")
    unknowns.push(
      "Rekaman ini tidak menyatakan adanya kebakaran; ia hanya memuat data lingkungan.",
    );
  if (o.ingestionMode === "historical")
    unknowns.push("Rekaman historis: tidak menggambarkan kondisi saat ini.");
  if (src && !src.active)
    unknowns.push("Sumber ini kini nonaktif dan tidak menerima rekaman baru.");

  return (
    <>
      <header className="mb-5 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 break-all text-[25px] leading-8 font-semibold tracking-[-0.015em] text-ink">
            {o.id}
          </h1>
          <QualityBadge q={o.quality} />
          <button
            type="button"
            onClick={() =>
              openOperatorAssistant(
                o.domain === "biodiversity" ? "observation" : "environment",
                o.id,
                [
                  { label: "Sumber", value: o.sourceCode },
                  { label: "Kualitas", value: QUALITY[o.quality].label },
                ],
                "Jelaskan observasi ini",
              )
            }
            className="ml-auto rounded-md px-3 py-1.5 text-[13px] font-medium text-brand hover:bg-brand-50"
          >
            ✧ Tanya AI
          </button>
          {o.ingestionMode === "historical" && (
            <span className="rounded border border-line px-1.5 py-px text-xs text-muted">
              Historis
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
          <DomainLabel d={o.domain} />
          <span>
            Sumber{" "}
            <Mono className="text-fg">
              {resolveObservationSourceCode(src?.code, o.sourceCode)}
            </Mono>
          </span>
          <span>
            Rekaman sumber <Mono className="text-fg">{o.sourceRecordId}</Mono>
          </span>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Panel title="Sumber, ingesti & waktu">
            <dl>
              <KV k="Sumber">
                {src ? (
                  <>
                    {src.name} <Mono className="text-muted">({src.code})</Mono>
                    {!src.active && (
                      <span className="ml-2 text-xs font-medium text-warn">
                        Nonaktif
                      </span>
                    )}
                  </>
                ) : (
                  <Mono>{o.sourceCode}</Mono>
                )}
              </KV>
              <KV k="ID rekaman sumber">
                <Mono>{o.sourceRecordId}</Mono>
              </KV>
              <KV k="Mode ingesti">
                {MODE[o.ingestionMode]}{" "}
                <Mono className="text-muted">({o.ingestionMode})</Mono>
              </KV>
              <KV k="Waktu observasi">
                {o.observedAt ? (
                  <Mono className="tnum">{fmtTs(o.observedAt, timeZone)}</Mono>
                ) : (
                  <>
                    <Unknown>Tidak diketahui</Unknown>
                    <p className="mt-0.5 text-[13px] text-muted">
                      Alasan: {o.unknownObservedTimeReason}
                    </p>
                  </>
                )}
              </KV>
              <KV k="Waktu diterima">
                <Mono className="tnum">{fmtTs(o.receivedAt, timeZone)}</Mono>
              </KV>
            </dl>
          </Panel>

          {o.domain === "biodiversity" && (
            <Panel title="Analisis bioakustik">
              <BioacousticAnalysisPanel observationId={o.id} />
            </Panel>
          )}

          {o.domain === "environmental_risk" && (
            <EnvironmentalAdvisory
              observationId={o.id}
              measurements={o.measurements.map((m) => ({
                label: KINDS[m.kind as MeasurementKind]?.label ?? m.kind,
                value: String(m.measuredValue),
                unit: m.unit,
              }))}
            />
          )}

          <Panel title="Provenans">
            <dl>
              <KV k="Atribusi">{o.provenance.attribution}</KV>
              <KV k="Catatan lisensi">
                {o.provenance.licenseNote ?? (
                  <Unknown>Belum tersedia pada respons API WC-008</Unknown>
                )}
              </KV>
              <KV k="Keterbatasan">
                {o.provenance.limitations.length ? (
                  <ul className="list-disc space-y-0.5 pl-4">
                    {o.provenance.limitations.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                ) : (
                  <Unknown>Tidak ada keterbatasan yang dicatat</Unknown>
                )}
              </KV>
              <KV k="Metode akuisisi">
                <span className="text-muted">
                  {o.provenance.acquisitionMethod ?? "Tidak diketahui"}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  Informasi berasal dari metadata sumber bila tersedia.
                </span>
              </KV>
            </dl>
          </Panel>

          {o.domain === "environmental_risk" && (
            <Panel
              title="Pengukuran lingkungan"
              aside={
                <span className="text-xs text-muted">
                  {o.measurements.length} pengukuran
                </span>
              }
              flush
            >
              {o.measurements.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted">
                  Tidak ada pengukuran yang dilampirkan.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <caption className="sr-only">
                      Pengukuran lingkungan untuk {o.id}
                    </caption>
                    <thead className="border-b border-line bg-bg/60 text-[13px] text-muted">
                      <tr>
                        {[
                          "Jenis",
                          "Nilai",
                          "Satuan",
                          "Waktu ukur",
                          "Kualitas",
                        ].map((h) => (
                          <th
                            key={h}
                            scope="col"
                            className="px-3 py-2 font-medium first:pl-4 last:pr-4"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {o.measurements.map((m) => (
                        <tr
                          key={`${m.kind}:${m.measuredValue}:${m.unit}:${m.measuredAt ?? "unknown"}`}
                        >
                          <th
                            scope="row"
                            className="py-3 pr-3 pl-4 font-normal"
                          >
                            {KINDS[m.kind as MeasurementKind]?.label ?? m.kind}
                            <Mono className="block text-xs text-muted">
                              {m.kind}
                            </Mono>
                          </th>
                          <td className="tnum px-3 py-3">
                            <Mono className="tnum text-[13px] text-ink">
                              {m.measuredValue}
                            </Mono>
                          </td>
                          <td className="px-3 py-3">{m.unit}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {m.measuredAt ? (
                              <Mono className="tnum">
                                {fmtTs(m.measuredAt, timeZone)}
                              </Mono>
                            ) : (
                              <Unknown>Tidak dicatat</Unknown>
                            )}
                          </td>
                          <td className="px-3 py-3 pr-4">
                            {m.quality ? (
                              <QualityBadge q={m.quality} />
                            ) : (
                              <Unknown>Tidak disediakan</Unknown>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </div>

        <aside className="space-y-5">
          <Panel title="Kualitas">
            <QualityBadge q={o.quality} />
            <p className="mt-2 text-[13px] leading-5 text-muted">
              {QUALITY[o.quality].desc}
            </p>
            <p className="mt-2 border-t border-line pt-2 text-xs text-muted">
              Operator tidak mengubah kualitas. Alur peninjauan menunggu
              integrasi WC-012.
            </p>
          </Panel>
          <Panel title="Lokasi">
            {o.location.hasCoordinates ? (
              <div className="flex gap-2.5 text-[13px] leading-5">
                <I.Lock className="mt-0.5 size-4 shrink-0 text-muted" />
                <div>
                  <p className="font-medium">Koordinat tersedia, ditahan</p>
                  <p className="text-muted">
                    Titik tersimpan di server, tetapi API tidak mengembalikan
                    koordinat presisi sesuai kebijakan privasi lokasi.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex gap-2.5 text-[13px] leading-5">
                <I.MapPin className="mt-0.5 size-4 shrink-0 text-warn" />
                <div>
                  <p className="font-medium">Lokasi tidak diketahui</p>
                  <p className="text-muted">
                    Alasan: {o.location.unknownReason ?? "tidak dicatat"}
                  </p>
                </div>
              </div>
            )}
          </Panel>
          <Panel title="Keterbatasan & yang tidak diketahui">
            <ul className="space-y-1.5 text-[13px] leading-5">
              {unknowns.map((u) => (
                <li key={u} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1 shrink-0 rounded-full bg-muted"
                  />
                  {u}
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </>
  );
}
