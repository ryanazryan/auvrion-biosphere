import Link from "next/link";
import { notFound } from "next/navigation";
import { ObservationLocationMap } from "@/components/gis/ObservationLocationMap";
import { CaseActionForm } from "@/components/supervisor/CaseActionForm";
import { ListenAudioPlayer } from "@/components/supervisor/ListenAudioPlayer";
import {
  dateTime,
  Empty,
  NavButton,
  PageHeading,
  Panel,
  StatusChip,
  shortId,
} from "@/components/supervisor/SupervisorElements";
import {
  formatEvidenceTime,
  formatMeasurementValue,
  ingestionModeLabel,
  sourceKindLabel,
} from "@/figma-operator/gis/observation-evidence-display";
import { isUuid } from "@/server/workflow/approved-case-policy";
import { getApprovedListenInstallationLabels } from "@/server/workflow/listen-installations";
import {
  findWorkspaceAccess,
  getWorkspaceCase,
  listEligibleRangers,
  listWorkspaceZones,
} from "@/server/workflow/workspace-queries";

const CASE_TRANSITION_LABELS: Record<string, string> = {
  "AB-TR-010": "Mulai peninjauan",
  "AB-TR-011": "Kirim kepada Supervisor",
  "AB-TR-012": "Pantau tanpa penugasan",
  "AB-TR-013": "Tugaskan Ranger",
};
const CASE_STATUS_LABELS: Record<string, string> = {
  received: "Diterima",
  under_review: "Dalam peninjauan",
  awaiting_decision: "Menunggu keputusan",
  monitoring: "Dalam pemantauan",
  assigned: "Ditugaskan",
  closed: "Selesai",
};
function readableCaseTransition(id: string) {
  return CASE_TRANSITION_LABELS[id] ?? "Perubahan status";
}
function readableCaseStatus(status: string) {
  return CASE_STATUS_LABELS[status] ?? "Status lainnya";
}

export const dynamic = "force-dynamic";
export default async function SupervisorCaseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const a = await findWorkspaceAccess("supervisor");
  if (!a.allowed) return null;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const detail = await getWorkspaceCase(a.organizationId, id);
  if (!detail) notFound();
  const { record: c, observations, events, tasks } = detail;
  const installationLabels = await getApprovedListenInstallationLabels(
    a.organizationId,
    observations
      .filter((o) => o.evidence?.sourceKind === "listen_device")
      .map((o) => o.id),
  );
  const [rangers, zones] =
    c.status === "awaiting_decision"
      ? await Promise.all([
          listEligibleRangers(a.organizationId),
          listWorkspaceZones(a.organizationId),
        ])
      : [[], []];
  return (
    <>
      <div className="mb-4">
        <Link
          className="text-xs font-semibold text-brand"
          href="/supervisor/decisions"
        >
          ← Kembali ke antrean
        </Link>
      </div>
      <PageHeading
        title={c.title}
        desc={`Case ${shortId(c.id)} · versi ${c.version} · dibuat ${dateTime(c.createdAt)}`}
        action={<StatusChip status={c.status} />}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <Panel title={`Observasi terkait · ${observations.length}`}>
            {!observations.length ? (
              <Empty text="Tidak ada observasi aktif yang terkait. Mutasi akan ditolak oleh service." />
            ) : (
              <ul className="divide-y divide-line">
                {observations.map((o) => (
                  <li key={o.id} className="px-4 py-3">
                    {o.evidence?.sourceKind === "listen_device" && (
                      <section
                        className="mt-3 rounded-md border border-line bg-white p-3"
                        aria-label="Rekaman audio LISTEN untuk Supervisor"
                      >
                        <p className="text-xs font-semibold text-ink">
                          Bukti audio asli LISTEN
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Lokasi pemasangan perangkat:{" "}
                          {installationLabels.get(o.id) ??
                            "Belum terverifikasi atau belum disetujui untuk ditampilkan"}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Lokasi sumber suara atau satwa belum dapat dipastikan
                          hanya dari posisi mikrofon.
                        </p>
                        <ListenAudioPlayer
                          src={`/api/supervisor/cases/${c.id}/observations/${o.id}/audio`}
                          title={`Putar rekaman LISTEN ${o.sourceCode}`}
                        />
                        <p className="mt-1 text-xs text-muted">
                          Audio disediakan dari penyimpanan privat setelah
                          autentikasi, MFA, dan pemeriksaan tautan Case.
                        </p>
                      </section>
                    )}
                    <p className="text-sm font-semibold text-ink">
                      {o.domain === "biodiversity"
                        ? "Biodiversitas"
                        : "Risiko lingkungan"}{" "}
                      · {o.sourceCode}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Kualitas: {o.quality} · diterima {dateTime(o.receivedAt)}{" "}
                      · diamati {dateTime(o.observedAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted">
                      {o.linkReason}
                    </p>
                    {o.domain === "biodiversity" && (
                      <p className="mt-2 rounded-lg bg-brand-50 p-2 text-xs text-ink">
                        Audio dapat berisi ucapan manusia, noise, atau satwa.
                        Hasil Perch adalah kandidat belum diverifikasi; gunakan
                        ringkasan Operator untuk menentukan tindakan.
                      </p>
                    )}
                    {o.domain === "environmental_risk" && (
                      <ObservationLocationMap
                        observationId={o.id}
                        organizationId={a.organizationId}
                      />
                    )}
                    {o.evidence?.audioRecordings.map((audio) => (
                      <p
                        key={audio.recordingId}
                        className="mt-2 text-xs font-medium text-brand"
                      >
                        Bukti WAV diterima · {audio.recordingId} ·{" "}
                        {(audio.durationMs / 1000).toFixed(1)} detik
                      </p>
                    ))}
                    {o.evidence && (
                      <div className="mt-3 space-y-2 rounded-md border border-line bg-bg p-3 text-xs leading-5">
                        <p className="font-semibold text-ink">
                          Bukti observasi untuk keputusan
                        </p>
                        <p>
                          Asal: {sourceKindLabel(o.evidence.sourceKind)} ·{" "}
                          {ingestionModeLabel(o.evidence.ingestionMode)}
                        </p>
                        <p>
                          ID rekaman sumber:{" "}
                          {o.evidence.sourceRecordId ?? "Tidak tersedia"}
                        </p>
                        <p>
                          Metode akuisisi:{" "}
                          {o.evidence.acquisitionMethod ?? "Belum diketahui"}
                        </p>
                        {o.evidence.measurements.length > 0 && (
                          <ul className="space-y-1 border-t border-line pt-2">
                            {o.evidence.measurements.map((m) => (
                              <li key={m.id}>
                                {m.kind === "air_temperature"
                                  ? "Suhu udara"
                                  : m.kind === "relative_humidity"
                                    ? "Kelembapan relatif"
                                    : m.kind === "pm2_5"
                                      ? "PM2.5"
                                      : m.kind}
                                : {formatMeasurementValue(m.measuredValue)}{" "}
                                {m.unit}
                                {" · "}
                                {formatEvidenceTime(m.measuredAt, "WITA")}
                                {" · kualitas: "}
                                {m.quality}
                              </li>
                            ))}
                          </ul>
                        )}
                        {o.evidence.attribution && (
                          <p>Atribusi: {o.evidence.attribution}</p>
                        )}
                        {o.evidence.limitations.length > 0 && (
                          <div className="border-t border-line pt-2">
                            <p className="font-medium">Keterbatasan sumber</p>
                            <ul className="list-disc pl-4">
                              {[...new Set(o.evidence.limitations)].map(
                                (note) => (
                                  <li key={note}>{note}</li>
                                ),
                              )}
                            </ul>
                          </div>
                        )}
                        <p className="text-muted">
                          {o.evidence.hasCoordinates
                            ? "Titik tersimpan, koordinat presisi dilindungi."
                            : "Titik belum diketahui."}{" "}
                          Zona operasional adalah area tugas, bukan koordinat
                          kejadian terverifikasi.
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Riwayat transisi & alasan">
            {!events.length ? (
              <Empty text="Belum ada event transisi pada Case ini." />
            ) : (
              <ol className="divide-y divide-line">
                {events.map((e) => (
                  <li
                    key={`${e.toVersion}-${e.transitionId}`}
                    className="px-4 py-3"
                  >
                    <p className="text-[13px] font-semibold text-ink">
                      {readableCaseTransition(e.transitionId)} ·{" "}
                      {readableCaseStatus(e.fromStatus)} →{" "}
                      {readableCaseStatus(e.toStatus)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Versi {e.fromVersion} → {e.toVersion} ·{" "}
                      {dateTime(e.createdAt)}
                    </p>
                    <p className="mt-2 text-[13px] leading-6">{e.reason}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          {tasks.length > 0 && (
            <Panel title="Tugas terkait">
              <ul className="divide-y divide-line">
                {tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col items-start gap-2">
                      <p className="truncate text-[13px] font-semibold">
                        {t.title}
                      </p>
                      <StatusChip status={t.status} />
                    </div>
                    <NavButton muted href={`/supervisor/tasks/${t.id}`}>
                      Detail tugas →
                    </NavButton>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
        <aside>
          <Panel title="Keputusan Supervisor">
            <div className="p-4">
              {c.status === "awaiting_decision" ? (
                <CaseActionForm
                  key={`${c.id}:${c.version}`}
                  caseId={c.id}
                  organizationId={a.organizationId}
                  version={c.version}
                  status={c.status}
                  actorRole="supervisor"
                  rangers={rangers}
                  zones={zones}
                />
              ) : (
                <p className="text-[13px] leading-6 text-muted">
                  Case ini tidak sedang menunggu keputusan. Transisi yang tidak
                  disetujui dinonaktifkan.
                </p>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}
