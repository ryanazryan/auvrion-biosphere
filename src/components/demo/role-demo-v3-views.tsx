"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { RoleDemoMap } from "./role-demo-map";
import {
  CASE_LABEL,
  type GuestObservation,
  type GuestState,
  type GuestTab,
  TASK_LABEL,
} from "./role-demo-v3-data";
import {
  Activity,
  INPUT,
  MetricGrid,
  ObservationRows,
  PerchResults,
  PRIMARY,
  SECONDARY,
  Surface,
  Tag,
  Title,
} from "./role-demo-v3-ui";

type Props = {
  tab: GuestTab;
  data: GuestState;
  update: (fn: (prev: GuestState) => GuestState) => void;
  navigate: (tab: GuestTab) => void;
  openAI: () => void;
};

function withActivity(prev: GuestState, description: string): GuestState {
  return { ...prev, events: [description, ...prev.events].slice(0, 60) };
}

function RecordedAudio({ onAnalyze }: { onAnalyze: () => void }) {
  const [selected, setSelected] = useState("REC-0006");
  return (
    <Surface title="Unggahan perangkat — Daftar rekaman">
      <div className="space-y-2">
        {[
          "REC-0006",
          "REC-0005",
          "REC-0004",
          "REC-0003",
          "REC-0002",
          "REC-0001",
        ].map((recording, index) => (
          <button
            key={recording}
            type="button"
            onClick={() => setSelected(recording)}
            className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left text-[13px] transition ${selected === recording ? "border-brand/40 bg-brand-50/70" : "border-line hover:bg-bg"}`}
          >
            <span>
              <strong className="block text-ink">{recording} · WAV</strong>
              <span className="mt-1 block text-xs text-muted">
                {index === 0
                  ? "29 Okt 2026 · 00.35 WITA"
                  : `28 Okt 2026 · 0${index + 1}.20 WITA`}
              </span>
            </span>
            <Tag>{selected === recording ? "Dipilih" : "Historis"}</Tag>
          </button>
        ))}
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <button type="button" className={PRIMARY} onClick={onAnalyze}>
          Analisis rekaman terpilih →
        </button>
      </div>
    </Surface>
  );
}

function OperatorPages({ tab, data, update, navigate, openAI }: Props) {
  const [selected, setSelected] = useState<GuestObservation | null>(null);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("Observasi manual");
  const [domain, setDomain] =
    useState<GuestObservation["domain"]>("biodiversity");
  const [location, setLocation] = useState("Banjarbaru, Kalimantan Selatan");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  function markReview(id: string) {
    update((prev) =>
      withActivity(
        {
          ...prev,
          observations: prev.observations.map((item) =>
            item.id === id ? { ...item, status: "under_review" } : item,
          ),
        },
        `Operator meninjau observasi ${id}`,
      ),
    );
  }
  function forward(id: string) {
    update((prev) =>
      withActivity(
        {
          ...prev,
          observations: prev.observations.map((item) =>
            item.id === id ? { ...item, status: "forwarded" } : item,
          ),
          caseStage: "awaiting_decision",
          taskStage: "assigned",
          finding: "",
          outcome: "",
        },
        `${id} dikirim kepada Supervisor`,
      ),
    );
  }
  function saveObservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const safe = title.trim();
    if (!safe) return;
    update((prev) =>
      withActivity(
        {
          ...prev,
          observations: [
            {
              id: `OBS-${2404 + prev.observations.length - 3}`,
              title: safe.slice(0, 120),
              domain,
              source,
              status: "unreviewed",
              note: notes.slice(0, 400),
              zone: location.slice(0, 100),
            },
            ...prev.observations,
          ],
        },
        `Operator mencatat observasi baru: ${safe.slice(0, 50)}`,
      ),
    );
    setTitle("");
    setNotes("");
    navigate("observations");
  }
  function downloadReport() {
    const rows = [
      "ID,Judul,Domain,Sumber,Status",
      ...data.observations.map((item) =>
        [item.id, item.title, item.domain, item.source, item.status]
          .map((part) => `"${part.replaceAll('"', '""')}"`)
          .join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF", rows.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "auvrion-observasi-demo.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (tab === "overview")
    return (
      <>
        <Title
          title="Ringkasan observasi"
          action={
            <button
              type="button"
              className={PRIMARY}
              onClick={() => navigate("observation-new")}
            >
              + Catat observasi
            </button>
          }
        />
        <MetricGrid
          onSelect={(value) => navigate(value as GuestTab)}
          items={[
            {
              label: "Total observasi",
              value: data.observations.length,
              tab: "observations",
            },
            {
              label: "Keanekaragaman hayati",
              value: data.observations.filter(
                (item) => item.domain === "biodiversity",
              ).length,
              tab: "observations",
            },
            {
              label: "Risiko lingkungan",
              value: data.observations.filter(
                (item) => item.domain === "environmental_risk",
              ).length,
              tab: "observations",
            },
            {
              label: "Belum ditinjau",
              value: data.observations.filter(
                (item) => item.status === "unreviewed",
              ).length,
              tab: "review",
            },
          ]}
        />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_320px]">
          <div className="space-y-5">
            <Surface
              title="Observasi terakhir diterima"
              aside={
                <button
                  type="button"
                  className="text-xs font-semibold text-brand"
                  onClick={() => navigate("observations")}
                >
                  Semua observasi →
                </button>
              }
            >
              <ObservationRows
                items={data.observations.slice(0, 5)}
                select={setSelected}
              />
            </Surface>
            <Surface
              title="LISTEN — Aktivitas perangkat"
              aside={
                <button
                  type="button"
                  className="text-xs font-semibold text-brand"
                  onClick={() => navigate("listen")}
                >
                  Buka LISTEN →
                </button>
              }
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted">Perangkat</p>
                  <p className="font-semibold text-ink">listen-esp32-01</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Rekaman diterima</p>
                  <p className="font-semibold text-ink">6 historis</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Analisis</p>
                  <p className="font-semibold text-ink">
                    {data.aiAnalyzed ? "Kandidat tersedia" : "Belum dijalankan"}
                  </p>
                </div>
              </div>
            </Surface>
          </div>
          <aside className="space-y-5">
            <Surface title="Auvrion AI">
              <p className="mb-4 text-[13px] leading-6 text-muted">
                Tanya tentang hasil audio, konteks indikasi lingkungan, dan alur
                verifikasi.
              </p>
              <button type="button" onClick={openAI} className={PRIMARY}>
                Buka Auvrion AI
              </button>
            </Surface>
            <Surface title="Aktivitas Operator">
              <Activity items={data.events.slice(0, 4)} />
            </Surface>
          </aside>
        </div>
        {selected && (
          <ObservationDialog
            item={selected}
            close={() => setSelected(null)}
            review={() => {
              markReview(selected.id);
              setSelected(null);
            }}
          />
        )}
      </>
    );

  if (tab === "observations" || tab === "review") {
    const filtered = data.observations.filter(
      (item) =>
        (tab !== "review" || item.status !== "forwarded") &&
        `${item.title} ${item.source}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
    return (
      <>
        <Title
          title={tab === "review" ? "Antrean Review" : "Observasi"}
          detail={
            tab === "review"
              ? "Tinjau kelengkapan dan teruskan observasi yang relevan"
              : "Rekaman observasi, kualitas bukti dan riwayat sumber"
          }
          action={
            <button
              type="button"
              className={PRIMARY}
              onClick={() => navigate("observation-new")}
            >
              + Catat observasi
            </button>
          }
        />
        <Surface
          title={
            tab === "review" ? "Perlu peninjauan Operator" : "Daftar Observasi"
          }
          aside={
            <input
              aria-label="Cari observasi"
              className={`${INPUT} w-44`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari observasi"
            />
          }
        >
          <div data-tour="review">
            <ObservationRows
              items={filtered}
              select={setSelected}
              onForward={forward}
            />
          </div>
          {filtered.length === 0 && (
            <p className="py-6 text-center text-xs text-muted">
              Tidak ada observasi sesuai filter.
            </p>
          )}
          {tab === "review" && (
            <p className="mt-3 text-xs text-muted">
              Pemeriksaan operator mendahului keputusan Supervisor. Analisis AI
              bukan konfirmasi spesies.
            </p>
          )}
        </Surface>
        {selected && (
          <ObservationDialog
            item={selected}
            close={() => setSelected(null)}
            review={() => {
              markReview(selected.id);
              setSelected(null);
            }}
          />
        )}
      </>
    );
  }

  if (tab === "observation-new")
    return (
      <>
        <Title
          title="Catat Observasi"
          detail="Registrasi observasi dan bukti di lingkungan kerja Operator"
        />
        <form
          data-tour="form"
          onSubmit={saveObservation}
          className="grid gap-5 lg:grid-cols-[1.5fr_1fr]"
        >
          <Surface title="Informasi observasi">
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-ink">
                Judul observasi
                <input
                  className={`${INPUT} mt-2`}
                  required
                  maxLength={120}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Misalnya: Pengamatan suara burung di pagi hari"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-ink">
                  Domain
                  <select
                    className={`${INPUT} mt-2`}
                    value={domain}
                    onChange={(event) =>
                      setDomain(
                        event.target.value as GuestObservation["domain"],
                      )
                    }
                  >
                    <option value="biodiversity">Keanekaragaman hayati</option>
                    <option value="environmental_risk">
                      Risiko lingkungan
                    </option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-ink">
                  Sumber
                  <select
                    className={`${INPUT} mt-2`}
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                  >
                    <option>Observasi manual</option>
                    <option>listen-esp32-01</option>
                    <option>NASA FIRMS</option>
                    <option>PREVENT</option>
                  </select>
                </label>
              </div>
              <label className="block text-xs font-semibold text-ink">
                Lokasi atau zona
                <input
                  className={`${INPUT} mt-2`}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  maxLength={100}
                  required
                />
              </label>
              <label className="block text-xs font-semibold text-ink">
                Catatan dan keterbatasan
                <textarea
                  className={`${INPUT} mt-2 min-h-28`}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={400}
                  placeholder="Kondisi lokasi, waktu observasi, kualitas data, dan keterbatasan"
                />
              </label>
              <div className="flex gap-2">
                <button type="submit" className={PRIMARY}>
                  Simpan observasi
                </button>
                <button
                  type="button"
                  className={SECONDARY}
                  onClick={() => navigate("observations")}
                >
                  Batal
                </button>
              </div>
            </div>
          </Surface>
          <Surface title="Pemeriksaan bukti">
            <p className="text-[13px] leading-6 text-muted">
              Pilih sumber, jelaskan keterbatasan, dan simpan observasi. Setelah
              tersimpan, buka Antrean Review untuk memeriksa kualitas dan
              meneruskan kepada Supervisor.
            </p>
            <button
              type="button"
              className={`${SECONDARY} mt-4`}
              onClick={() => navigate("listen")}
            >
              Buka sumber LISTEN →
            </button>
          </Surface>
        </form>
      </>
    );

  if (tab === "handoffs")
    return (
      <>
        <Title
          title="Pelacakan Handoff"
          detail="Riwayat perpindahan observasi menjadi Case dan penugasan lintas peran"
        />
        <div
          data-tour="handoff"
          className="grid gap-5 lg:grid-cols-[1fr_320px]"
        >
          <Surface title="CASE-2401 · Alur operasional">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <Tag intent="success">Operator</Tag>
              <span>→</span>
              <Tag intent="warning">
                Supervisor · {CASE_LABEL[data.caseStage]}
              </Tag>
              <span>→</span>
              <Tag>Ranger · {TASK_LABEL[data.taskStage]}</Tag>
            </div>
            <div className="mt-5">
              <Activity items={data.events.slice(0, 12)} />
            </div>
          </Surface>
          <Surface title="Tindakan selanjutnya">
            <p className="mb-4 text-[13px] text-muted">
              Kasus yang telah dikirim membutuhkan keputusan Supervisor sebelum
              verifikasi lapangan.
            </p>
            <Link href="/demo/supervisor" className={PRIMARY}>
              Buka workspace Supervisor →
            </Link>
          </Surface>
        </div>
      </>
    );

  if (tab === "iot")
    return (
      <>
        <Title
          title="Alat IoT"
          detail="Sumber bioakustik LISTEN dan rancangan pemantauan lingkungan PREVENT"
        />
        <div data-tour="devices" className="grid gap-5 md:grid-cols-2">
          <DeviceTile
            image="/device-illustrations/listen-device.png"
            name="LISTEN"
            description="ESP32 · Mikrofon I2S · Perekaman bioakustik"
            action={() => navigate("listen")}
            state="Registrasi aktif · 6 rekaman"
          />
          <DeviceTile
            image="/device-illustrations/prevent-device.png"
            name="PREVENT"
            description="Konsep pemantauan karhutla · sensor lingkungan"
            action={() => navigate("prevent")}
            state="Mockup perangkat · indikator skenario"
          />
        </div>
      </>
    );

  if (tab === "listen")
    return (
      <>
        <Title
          title="Pemantauan LISTEN"
          detail="Perangkat, rekaman historis, dan analisis bioakustik"
          action={
            <button type="button" onClick={openAI} className={SECONDARY}>
              Auvrion AI
            </button>
          }
        />
        <MetricGrid
          items={[
            { label: "Sumber terdaftar", value: 1 },
            { label: "Rekaman historis", value: 6 },
            { label: "Perlu ditinjau", value: data.audioReviewed ? 0 : 1 },
            { label: "Kandidat analisis", value: data.aiAnalyzed ? 3 : 0 },
          ]}
        />
        <div className="mb-5 grid gap-5 md:grid-cols-2">
          <Surface title="LISTEN-01 · Monitor perangkat">
            <div className="space-y-4">
              <p className="font-semibold text-ink">
                listen-esp32-01 <Tag intent="success">Registrasi aktif</Tag>
              </p>
              <div className="rounded-md border border-line bg-bg p-4 text-[13px] leading-7">
                <p>Perangkat: ESP32 + mikrofon I2S</p>
                <p>Unggahan: 6 rekaman historis</p>
                <p>Status jaringan: belum dikonfirmasi</p>
                <p>Sinkronisasi terakhir: 29 Okt 2026</p>
              </div>
              <button
                type="button"
                className={SECONDARY}
                onClick={() => navigate("observations")}
              >
                Buka observasi terkait →
              </button>
            </div>
          </Surface>
          <Surface title="Alur observasi bioakustik">
            <Activity
              items={[
                "Ambil rekaman LISTEN",
                "Evaluasi mutu audio",
                "Jalankan analisis Perch 2.0",
                "Operator meninjau hasil",
                "Kirim Case kepada Supervisor",
              ]}
            />
          </Surface>
        </div>
        <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
          <RecordedAudio
            onAnalyze={() =>
              update((prev) =>
                withActivity(
                  { ...prev, aiAnalyzed: true },
                  "Hasil kandidat Perch 2.0 tersedia untuk tinjauan",
                ),
              )
            }
          />
          <PerchResults
            analyzed={data.aiAnalyzed}
            onAnalyze={() =>
              update((prev) =>
                withActivity(
                  { ...prev, aiAnalyzed: true },
                  "Analisis Perch 2.0 menghasilkan kandidat satwa",
                ),
              )
            }
            reviewed={data.audioReviewed}
            onReview={() =>
              update((prev) =>
                withActivity(
                  { ...prev, audioReviewed: true },
                  "Operator meninjau hasil analisis bioakustik",
                ),
              )
            }
          />
        </div>
      </>
    );

  if (tab === "prevent") {
    const scenarios = {
      normal: {
        temp: "30,1°C",
        humidity: "76%",
        pm: "18 µg/m³",
        label: "Rendah",
      },
      waspada: {
        temp: "34,7°C",
        humidity: "48%",
        pm: "58 µg/m³",
        label: "Waspada",
      },
      tinggi: {
        temp: "38,2°C",
        humidity: "30%",
        pm: "142 µg/m³",
        label: "Tinggi",
      },
    };
    const snapshot = scenarios[data.preventScenario];
    return (
      <>
        <Title
          title="PREVENT · Pemantauan risiko"
          detail="Mockup perangkat lingkungan dan visualisasi skenario risiko karhutla"
        />
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Surface title="PREVENT-01 · Rancangan perangkat">
            <Image
              src="/device-illustrations/prevent-device.png"
              width={450}
              height={350}
              alt="Ilustrasi konsep perangkat PREVENT"
              className="mx-auto h-52 w-full object-contain"
            />
            <p className="mt-2 text-xs text-muted">
              Konsep IoT lingkungan; panel ini tidak menyatakan perangkat fisik
              telah mengirim telemetri.
            </p>
          </Surface>
          <div className="space-y-5">
            <Surface title="Pengujian skenario">
              <div className="grid gap-3 sm:grid-cols-3">
                {(["normal", "waspada", "tinggi"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={data.preventScenario === value}
                    className={`${data.preventScenario === value ? PRIMARY : SECONDARY} capitalize`}
                    onClick={() =>
                      update((prev) =>
                        withActivity(
                          { ...prev, preventScenario: value },
                          `Skenario PREVENT berubah menjadi ${value}`,
                        ),
                      )
                    }
                  >
                    {value}
                  </button>
                ))}
              </div>
            </Surface>
            <MetricGrid
              items={[
                { label: "Suhu", value: snapshot.temp },
                { label: "Kelembapan", value: snapshot.humidity },
                { label: "PM2.5", value: snapshot.pm },
                { label: "Tingkat risiko", value: snapshot.label },
              ]}
            />
            <Surface title="Analisis risiko lingkungan">
              <p className="text-[13px] leading-6 text-fg">
                {data.preventScenario === "normal"
                  ? "Tidak terdapat peningkatan indikator risiko yang menonjol pada skenario ini."
                  : data.preventScenario === "waspada"
                    ? "Peningkatan suhu dan partikel memerlukan pemantauan lanjutan serta korelasi dengan sumber satelit."
                    : "Skenario menunjukkan gabungan indikator risiko tinggi. Perlu pemeriksaan sumber independen dan verifikasi lapangan."}
              </p>
              <button
                className={`${SECONDARY} mt-4`}
                type="button"
                onClick={openAI}
              >
                Tanyakan kepada Auvrion AI
              </button>
            </Surface>
          </div>
        </div>
      </>
    );
  }

  if (tab === "map")
    return (
      <>
        <Title
          title="Peta Observasi"
          detail="Navigasi wilayah publik dan konteks spasial pengamatan"
        />
        <div data-tour="map">
          <RoleDemoMap />
        </div>
      </>
    );

  return (
    <>
      <Title
        title="Laporan Operator"
        detail="Rekap observasi, kualitas sumber, dan status tindak lanjut"
        action={
          <button type="button" className={PRIMARY} onClick={downloadReport}>
            Ekspor CSV
          </button>
        }
      />
      <MetricGrid
        items={[
          { label: "Observasi", value: data.observations.length },
          {
            label: "Diteruskan",
            value: data.observations.filter(
              (item) => item.status === "forwarded",
            ).length,
          },
          {
            label: "Review",
            value: data.observations.filter(
              (item) => item.status === "under_review",
            ).length,
          },
          {
            label: "Belum ditinjau",
            value: data.observations.filter(
              (item) => item.status === "unreviewed",
            ).length,
          },
        ]}
      />
      <Surface title="Ringkasan laporan">
        <ObservationRows items={data.observations} select={setSelected} />
      </Surface>
      {selected && (
        <ObservationDialog
          item={selected}
          close={() => setSelected(null)}
          review={() => {
            markReview(selected.id);
            setSelected(null);
          }}
        />
      )}
    </>
  );
}

function ObservationDialog({
  item,
  close,
  review,
}: {
  item: GuestObservation;
  close: () => void;
  review: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Tutup detail"
        onClick={close}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Detail ${item.id}`}
        className="relative z-10 w-full max-w-xl rounded-xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Detail Observasi</h2>
          <button
            type="button"
            aria-label="Tutup detail"
            onClick={close}
            className="rounded-md border border-line px-3 py-1 text-xl"
          >
            ×
          </button>
        </div>
        <p className="mt-2 font-mono text-xs text-muted">{item.id}</p>
        <h3 className="mt-2 text-[16px] font-semibold text-ink">
          {item.title}
        </h3>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-[13px]">
          <div>
            <dt className="text-muted">Sumber</dt>
            <dd className="font-medium">{item.source}</dd>
          </div>
          <div>
            <dt className="text-muted">Wilayah</dt>
            <dd className="font-medium">{item.zone}</dd>
          </div>
          <div>
            <dt className="text-muted">Domain</dt>
            <dd>
              {item.domain === "biodiversity"
                ? "Biodiversitas"
                : "Risiko lingkungan"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Status</dt>
            <dd>
              <Tag>{item.status}</Tag>
            </dd>
          </div>
        </dl>
        <p className="mt-4 rounded-md bg-bg p-3 text-xs leading-6 text-fg">
          {item.note || "Tidak ada catatan tambahan."}
        </p>
        <div className="mt-5 flex gap-2">
          <button type="button" className={PRIMARY} onClick={review}>
            Mulai / selesaikan review
          </button>
          <button type="button" className={SECONDARY} onClick={close}>
            Kembali
          </button>
        </div>
      </section>
    </div>
  );
}

function DeviceTile({
  image,
  name,
  description,
  action,
  state,
}: {
  image: string;
  name: string;
  description: string;
  action: () => void;
  state: string;
}) {
  return (
    <Surface title={`${name} · Perangkat IoT`}>
      <Image
        src={image}
        alt={`Ilustrasi ${name}`}
        width={500}
        height={300}
        className="mx-auto h-56 w-full object-contain"
      />
      <h3 className="mt-3 font-semibold text-ink">{description}</h3>
      <p className="my-3 text-xs text-muted">{state}</p>
      <button type="button" className={PRIMARY} onClick={action}>
        Buka {name} →
      </button>
    </Surface>
  );
}

export { OperatorPages };

function SupervisorPages({ tab, data, update, navigate, openAI }: Props) {
  const [assignee, setAssignee] = useState("Ranger A — Kalimantan Selatan");
  const [decisionNote, setDecisionNote] = useState(
    "Periksa lokasi indikasi bersama bukti lapangan.",
  );
  const [closure, setClosure] = useState(
    "Verifikasi lapangan selesai; status telah dievaluasi.",
  );
  const setAssignment = () => {
    update((prev) =>
      withActivity(
        { ...prev, caseStage: "assigned", taskStage: "assigned" },
        `Supervisor menugaskan ${assignee}; ${decisionNote.slice(0, 120)}`,
      ),
    );
    navigate("tasks");
  };
  const closeCase = () => {
    if (!closure.trim()) return;
    update((prev) =>
      withActivity(
        {
          ...prev,
          caseStage: "completed",
          taskStage: "completed",
          outcome: closure.trim().slice(0, 400),
        },
        "Supervisor mengevaluasi hasil Ranger dan menutup CASE-2401",
      ),
    );
  };
  const hasSubmitted =
    data.taskStage === "submitted" || data.taskStage === "completed";
  if (tab === "overview")
    return (
      <>
        <Title
          title="Ringkasan operasi"
          action={
            <button
              type="button"
              className={PRIMARY}
              onClick={() => navigate("decisions")}
            >
              Buka antrean keputusan →
            </button>
          }
        />
        <MetricGrid
          onSelect={(value) => navigate(value as GuestTab)}
          items={[
            {
              label: "Menunggu keputusan",
              value: data.caseStage === "awaiting_decision" ? 1 : 0,
              tab: "decisions",
            },
            { label: "Dipantau", value: data.caseStage === "assigned" ? 1 : 0 },
            {
              label: "Tugas aktif",
              value:
                ["assigned", "accepted", "in_progress"].includes(
                  data.taskStage,
                ) && data.caseStage !== "awaiting_decision"
                  ? 1
                  : 0,
              tab: "tasks",
            },
            {
              label: "Laporan masuk",
              value: hasSubmitted ? 1 : 0,
              tab: "outcomes",
            },
          ]}
        />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_320px]">
          <div className="space-y-5">
            <Surface
              title="Antrean keputusan"
              aside={
                <button
                  type="button"
                  className="text-xs font-semibold text-brand"
                  onClick={() => navigate("decisions")}
                >
                  Lihat semua →
                </button>
              }
            >
              <CaseSummary data={data} onSelect={() => navigate("decisions")} />
            </Surface>
            <Surface title="Aktivitas Ranger">
              <Activity items={data.events.slice(0, 6)} />
            </Surface>
          </div>
          <aside className="space-y-5">
            <Surface title="Perlu perhatian">
              <p className="text-[13px] leading-6 text-muted">
                {data.caseStage === "awaiting_decision"
                  ? "1 Case menunggu keputusan Supervisor."
                  : hasSubmitted
                    ? "Hasil pemeriksaan Ranger siap dievaluasi."
                    : "Pantau kemajuan penugasan Ranger."}
              </p>
              <button
                className={`${SECONDARY} mt-3`}
                type="button"
                onClick={() => navigate(hasSubmitted ? "outcomes" : "tasks")}
              >
                Buka tindak lanjut
              </button>
            </Surface>
            <Surface title="Auvrion AI">
              <p className="text-xs leading-6 text-muted">
                Ringkas data observasi dan status keputusan operasional.
              </p>
              <button
                className={`${PRIMARY} mt-3`}
                type="button"
                onClick={openAI}
              >
                Buka Auvrion AI
              </button>
            </Surface>
          </aside>
        </div>
      </>
    );
  if (tab === "decisions")
    return (
      <>
        <Title
          title="Antrean keputusan"
          detail="Tinjau kasus dan tetapkan tindak lanjut berdasarkan bukti"
        />
        <div
          data-tour="decision"
          className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
        >
          <Surface title="CASE-2401 · Indikasi termal area pengamatan">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Tag intent="warning">{CASE_LABEL[data.caseStage]}</Tag>
                <span className="font-mono text-xs text-muted">
                  OBS-2401 / NASA FIRMS
                </span>
              </div>
              <h3 className="font-semibold text-ink">
                Indikasi anomali termal di area pemantauan
              </h3>
              <p className="text-[13px] leading-6 text-muted">
                Observasi awal dari Operator. Data satelit menjadi indikator
                pendukung; diperlukan verifikasi dan keputusan manusia.
              </p>
              <div className="rounded-md border border-line bg-bg p-3 text-xs leading-6">
                <p>Wilayah: Kalimantan Selatan</p>
                <p>Domain: risiko lingkungan</p>
                <p>Evidence: observasi termal dan riwayat Operator</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={PRIMARY}
                  disabled={data.caseStage !== "awaiting_decision"}
                  onClick={() => navigate("assignments")}
                >
                  Tetapkan tugas Ranger →
                </button>
                <button
                  type="button"
                  className={SECONDARY}
                  onClick={() => navigate("map")}
                >
                  Periksa peta
                </button>
              </div>
            </div>
          </Surface>
          <Surface title="Riwayat tinjauan">
            <Activity items={data.events.slice(0, 7)} />
          </Surface>
        </div>
      </>
    );
  if (tab === "assignments")
    return (
      <>
        <Title
          title="Penugasan ranger"
          detail="Kelola penerima tugas, instruksi, dan keselamatan lapangan"
        />
        <div
          data-tour="assignment"
          className="grid gap-5 lg:grid-cols-[1.4fr_1fr]"
        >
          <Surface title="Tugaskan CASE-2401">
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-ink">
                Ranger
                <select
                  className={`${INPUT} mt-2`}
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                >
                  <option>Ranger A — Kalimantan Selatan</option>
                  <option>Ranger B — Banjarbaru</option>
                  <option>Ranger C — Kalimantan Tengah</option>
                </select>
              </label>
              <label className="block text-xs font-semibold text-ink">
                Instruksi pemeriksaan
                <textarea
                  className={`${INPUT} mt-2 min-h-24`}
                  value={decisionNote}
                  maxLength={400}
                  onChange={(event) => setDecisionNote(event.target.value)}
                />
              </label>
              <button
                type="button"
                className={PRIMARY}
                onClick={setAssignment}
                disabled={
                  data.caseStage !== "awaiting_decision" || !decisionNote.trim()
                }
              >
                {data.caseStage === "awaiting_decision"
                  ? "Buat tugas & kirim kepada Ranger"
                  : "Penugasan sudah dibuat"}
              </button>
            </div>
          </Surface>
          <Surface title="Pedoman lapangan">
            <p className="text-[13px] leading-6 text-muted">
              Pastikan area aman, catat koordinat, ambil bukti foto bila
              tersedia, dan laporkan ketidakpastian hasil melalui alur
              pemeriksaan Ranger.
            </p>
            <button
              type="button"
              className={`${SECONDARY} mt-3`}
              onClick={() => navigate("tasks")}
            >
              Lihat daftar tugas →
            </button>
          </Surface>
        </div>
      </>
    );
  if (tab === "tasks")
    return (
      <>
        <Title
          title="Tugas ranger"
          detail="Pemantauan distribusi tugas dan hasil pemeriksaan"
        />
        <div data-tour="task">
          <Surface title="Daftar tugas">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-ink">
                TASK-2401 · Verifikasi indikasi termal
              </p>
              <Tag
                intent={data.taskStage === "completed" ? "success" : "warning"}
              >
                {TASK_LABEL[data.taskStage]}
              </Tag>
            </div>
            <p className="mt-3 text-xs text-muted">
              Ranger A · Kalimantan Selatan · CASE-2401
            </p>
            <p className="mt-3 text-[13px] leading-6 text-fg">
              {data.finding || "Menunggu hasil dari pemeriksaan lapangan."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className={PRIMARY} href="/demo/ranger">
                Buka workspace Ranger →
              </Link>
              <button
                className={SECONDARY}
                type="button"
                onClick={() => navigate("outcomes")}
              >
                Hasil kasus
              </button>
            </div>
          </Surface>
        </div>
      </>
    );
  if (tab === "outcomes")
    return (
      <>
        <Title
          title="Hasil kasus"
          detail="Evaluasi hasil verifikasi Ranger dan keputusan penutupan"
        />
        <div
          data-tour="outcome"
          className="grid gap-5 lg:grid-cols-[1.4fr_1fr]"
        >
          <Surface title="CASE-2401 · Pemeriksaan lapangan">
            <Tag intent={hasSubmitted ? "success" : "warning"}>
              {CASE_LABEL[data.caseStage]}
            </Tag>
            <div className="mt-4 rounded-md border border-line bg-bg p-4 text-[13px] leading-6">
              {data.finding || "Laporan Ranger belum diterima."}
            </div>
            <label className="mt-4 block text-xs font-semibold">
              Kesimpulan Supervisor
              <textarea
                className={`${INPUT} mt-2 min-h-24`}
                value={closure}
                onChange={(event) => setClosure(event.target.value)}
                maxLength={400}
              />
            </label>
            <button
              type="button"
              className={`${PRIMARY} mt-4`}
              disabled={data.taskStage !== "submitted" || !closure.trim()}
              onClick={closeCase}
            >
              {data.caseStage === "completed"
                ? "Case sudah ditutup"
                : "Evaluasi & tutup Case"}
            </button>
          </Surface>
          <Surface title="Audit keputusan">
            <Activity items={data.events.slice(0, 8)} />
          </Surface>
        </div>
      </>
    );
  if (tab === "analytics")
    return (
      <>
        <Title
          title="Analitik operasional"
          detail="Pemantauan tren kasus, penugasan, dan penyelesaian operasi"
        />
        <MetricGrid
          items={[
            {
              label: "Observasi diterima",
              value: data.observations.filter(
                (item) => item.status === "forwarded",
              ).length,
            },
            { label: "Case ditangani", value: 1 },
            {
              label: "Penugasan",
              value: data.caseStage === "awaiting_decision" ? 0 : 1,
            },
            {
              label: "Case selesai",
              value: data.caseStage === "completed" ? 1 : 0,
            },
          ]}
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <Surface title="Tren peninjauan">
            <div
              role="img"
              aria-label="Grafik batang jumlah kasus per hari"
              className="flex h-40 items-end gap-3 border-b border-line pb-1"
            >
              {[25, 42, 30, 75, 52, 85, 61, 45].map((height) => (
                <div
                  key={`bar-${height}`}
                  className="flex-1 rounded-t bg-brand"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Distribusi aktivitas periode contoh
            </p>
          </Surface>
          <Surface title="Komposisi tindak lanjut">
            <div className="flex items-center gap-5">
              <div className="grid size-32 shrink-0 place-items-center rounded-full bg-[conic-gradient(#168d69_0_45%,#f0ac37_45%_70%,#b1d3c0_70%_100%)]">
                <span className="grid size-20 place-items-center rounded-full bg-white text-sm font-semibold text-ink">
                  CASE
                </span>
              </div>
              <div className="space-y-2 text-xs text-muted">
                <p>● Peninjauan</p>
                <p>● Penugasan</p>
                <p>● Evaluasi hasil</p>
              </div>
            </div>
          </Surface>
        </div>
      </>
    );
  return (
    <>
      <Title
        title="Peta lingkungan"
        detail="Basemap publik untuk meninjau konteks wilayah"
      />
      <div data-tour="map">
        <RoleDemoMap />
      </div>
    </>
  );
}

function CaseSummary({
  data,
  onSelect,
}: {
  data: GuestState;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-wrap items-start justify-between gap-3 rounded-md border border-line p-4 text-left transition hover:bg-bg"
    >
      <div>
        <p className="font-mono text-xs text-muted">CASE-2401</p>
        <h3 className="mt-1 font-semibold text-ink">Indikasi anomali termal</h3>
        <p className="mt-1 text-xs text-muted">
          Observasi Operator • verifikasi manusia
        </p>
      </div>
      <Tag intent="warning">{CASE_LABEL[data.caseStage]}</Tag>
    </button>
  );
}

function RangerPages({ tab, data, update, navigate, openAI }: Props) {
  const [notes, setNotes] = useState(data.finding);
  const [priority, setPriority] = useState(
    "Terindikasi dan memerlukan pemeriksaan ulang",
  );
  const [photoName, setPhotoName] = useState("");
  const move = (status: GuestState["taskStage"], description: string) =>
    update((prev) => withActivity({ ...prev, taskStage: status }, description));
  const submit = () => {
    if (!notes.trim() || data.taskStage !== "in_progress") return;
    update((prev) =>
      withActivity(
        {
          ...prev,
          taskStage: "submitted",
          caseStage: "submitted",
          finding: `${notes.slice(0, 500)}. Evaluasi: ${priority}.${photoName ? ` Bukti: ${photoName}.` : ""}`,
        },
        "Ranger menyerahkan hasil pemeriksaan kepada Supervisor",
      ),
    );
    navigate("tasks");
  };
  const task = (
    <Surface title="TASK-2401 · Verifikasi indikasi termal">
      <div data-tour="task" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <strong className="text-[14px] text-ink">
            Tinjauan lokasi di Kalimantan Selatan
          </strong>
          <Tag intent={data.taskStage === "completed" ? "success" : "warning"}>
            {TASK_LABEL[data.taskStage]}
          </Tag>
        </div>
        <div className="rounded-md border border-line bg-bg p-3 text-[13px] leading-6">
          <p>Case: CASE-2401</p>
          <p>Sumber: observasi Operator / NASA FIRMS</p>
          <p>Lokasi kerja: Kalimantan Selatan</p>
        </div>
        <p className="text-[13px] leading-6 text-muted">
          Periksa situasi lingkungan, catat kondisi aktual, dan hindari
          pengambilan keputusan tanpa bukti lapangan.
        </p>
        <div className="flex flex-wrap gap-2">
          {data.taskStage === "assigned" && (
            <button
              type="button"
              className={PRIMARY}
              onClick={() =>
                move("accepted", "Ranger menerima tugas TASK-2401")
              }
            >
              Terima tugas
            </button>
          )}
          {data.taskStage === "accepted" && (
            <button
              type="button"
              className={PRIMARY}
              onClick={() =>
                move("in_progress", "Ranger memulai pemeriksaan di lokasi")
              }
            >
              Mulai verifikasi
            </button>
          )}
          {data.taskStage === "in_progress" && (
            <>
              <button
                type="button"
                className={PRIMARY}
                onClick={() => navigate("findings")}
              >
                Catat temuan →
              </button>
              <button
                type="button"
                className={SECONDARY}
                onClick={() =>
                  move("blocked", "Ranger menandai hambatan di lapangan")
                }
              >
                Tandai hambatan
              </button>
            </>
          )}
          {data.taskStage === "blocked" && (
            <button
              type="button"
              className={PRIMARY}
              onClick={() =>
                move("in_progress", "Hambatan Ranger selesai ditangani")
              }
            >
              Lanjutkan pemeriksaan
            </button>
          )}
          {data.taskStage === "submitted" && (
            <Link href="/demo/supervisor" className={SECONDARY}>
              Lihat di Supervisor →
            </Link>
          )}
          {data.taskStage === "completed" && (
            <Tag intent="success">Tugas selesai</Tag>
          )}
        </div>
      </div>
    </Surface>
  );
  if (tab === "overview")
    return (
      <>
        <Title
          title="Beranda Ranger"
          detail="Aktivitas pemeriksaan dan tindak lanjut lapangan"
        />
        <MetricGrid
          onSelect={(value) => navigate(value as GuestTab)}
          items={[
            { label: "Tugas saya", value: 1, tab: "tasks" },
            {
              label: "Perlu ditindaklanjuti",
              value: [
                "assigned",
                "accepted",
                "in_progress",
                "blocked",
              ].includes(data.taskStage)
                ? 1
                : 0,
            },
            {
              label: "Laporan diajukan",
              value: data.taskStage === "submitted" ? 1 : 0,
            },
            { label: "Selesai", value: data.taskStage === "completed" ? 1 : 0 },
          ]}
        />
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          {task}
          <Surface title="Koordinasi lapangan">
            <p className="text-[13px] leading-6 text-muted">
              Baca instruksi keselamatan, periksa konteks peta, dan kirim
              laporan pemeriksaan melalui Temuan Lapangan.
            </p>
            <button
              type="button"
              className={`${SECONDARY} mt-4`}
              onClick={openAI}
            >
              Tanya Auvrion AI
            </button>
          </Surface>
        </div>
      </>
    );
  if (tab === "tasks")
    return (
      <>
        <Title
          title="Tugas Saya"
          detail="Daftar tugas, prioritas, dan status pemeriksaan"
        />
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          {task}
          <Surface title="Keselamatan">
            <p className="rounded-lg border border-[#e8d6b7] bg-[#fff7e8] p-4 text-[13px] leading-6 text-[#745826]">
              Jangan lanjutkan pemeriksaan jika kondisi lapangan tidak aman.
              Utamakan komunikasi dengan Supervisor dan catat hambatan.
            </p>
            <button
              type="button"
              className={`${SECONDARY} mt-3`}
              onClick={() => navigate("map")}
            >
              Lihat peta lokasi
            </button>
          </Surface>
        </div>
      </>
    );
  if (tab === "findings")
    return (
      <>
        <Title
          title="Temuan Lapangan"
          detail="Dokumentasikan pemeriksaan dan serahkan laporan kepada Supervisor"
        />
        <div
          data-tour="finding"
          className="grid gap-5 lg:grid-cols-[1.5fr_1fr]"
        >
          <Surface title="Laporan pemeriksaan TASK-2401">
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-ink">
                Uraian temuan
                <textarea
                  value={notes}
                  maxLength={500}
                  disabled={data.taskStage !== "in_progress"}
                  onChange={(event) => setNotes(event.target.value)}
                  className={`${INPUT} mt-2 min-h-32`}
                  placeholder="Tuliskan kondisi lapangan dan hasil verifikasi"
                />
              </label>
              <label className="block text-xs font-semibold text-ink">
                Kesimpulan sementara
                <select
                  className={`${INPUT} mt-2`}
                  value={priority}
                  disabled={data.taskStage !== "in_progress"}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  <option>Terindikasi dan memerlukan pemeriksaan ulang</option>
                  <option>Tidak ditemukan indikasi di lokasi</option>
                  <option>Perlu tindakan lanjutan</option>
                </select>
              </label>
              <label className="block text-xs font-semibold text-ink">
                Bukti foto (lokal)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={data.taskStage !== "in_progress"}
                  className="mt-2 block w-full text-xs"
                  onChange={(event) =>
                    setPhotoName(event.target.files?.[0]?.name ?? "")
                  }
                />
              </label>
              {photoName && (
                <p className="text-xs text-brand">Foto dipilih: {photoName}</p>
              )}
              <button
                type="button"
                className={PRIMARY}
                onClick={submit}
                disabled={data.taskStage !== "in_progress" || !notes.trim()}
              >
                Kirim hasil kepada Supervisor
              </button>
            </div>
            {data.finding && (
              <p className="mt-4 rounded bg-brand-50 p-3 text-xs leading-6 text-ink">
                {data.finding}
              </p>
            )}
          </Surface>
          <Surface title="Pemeriksaan aman">
            <p className="text-[13px] leading-6 text-muted">
              Periksa kondisi lokasi, dokumentasikan dengan akurat, dan hentikan
              aktivitas apabila ada bahaya. Nama foto hanya disimpan sebagai
              referensi di sesi browser.
            </p>
            <button
              type="button"
              className={`${SECONDARY} mt-3`}
              onClick={() => navigate("tasks")}
            >
              Kembali ke tugas
            </button>
          </Surface>
        </div>
      </>
    );
  if (tab === "history")
    return (
      <>
        <Title
          title="Riwayat"
          detail="Linimasa aktivitas dan perubahan status operasional"
        />
        <div data-tour="history">
          <Surface title="Riwayat aktivitas Ranger">
            <Activity items={data.events} />
          </Surface>
        </div>
      </>
    );
  return (
    <>
      <Title
        title="Peta Lingkungan"
        detail="Navigasi wilayah dan konteks perjalanan lapangan"
      />
      <div data-tour="map">
        <RoleDemoMap />
      </div>
    </>
  );
}

export { RangerPages, SupervisorPages };
