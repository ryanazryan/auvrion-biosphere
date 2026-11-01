"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { SidebarBrandImage } from "@/components/branding/SidebarBrandImage";
import {
  Heading,
  InfoCard,
  RangerStatus,
  SafetyPanel,
} from "@/components/ranger/RangerViews";
import {
  PageHeading,
  Panel,
  StatusChip,
} from "@/components/supervisor/SupervisorElements";
import { SidebarToggleIcon } from "@/components/ui/SidebarToggleIcon";
import {
  CASE_LABEL,
  DEMO_STORAGE_KEY,
  type DemoObservation,
  type DemoState,
  ROLE_NAMES,
  type Role,
  START,
  TASK_LABEL,
} from "./role-demo-data";
import { RoleDemoMap } from "./role-demo-map";

type Tab =
  | "overview"
  | "observations"
  | "listen"
  | "map"
  | "decisions"
  | "assignments"
  | "tasks"
  | "findings"
  | "history";
const NAV: Record<Role, { tab: Tab; title: string; icon: string }[]> = {
  operator: [
    { tab: "overview", title: "Ringkasan", icon: "grid" },
    { tab: "observations", title: "Observasi", icon: "file" },
    { tab: "listen", title: "Perangkat LISTEN", icon: "radio" },
    { tab: "map", title: "Peta lingkungan", icon: "map" },
  ],
  supervisor: [
    { tab: "overview", title: "Ringkasan operasi", icon: "grid" },
    { tab: "decisions", title: "Antrean keputusan", icon: "file" },
    { tab: "assignments", title: "Penugasan Ranger", icon: "users" },
    { tab: "tasks", title: "Tugas Ranger", icon: "radio" },
    { tab: "map", title: "Peta lingkungan", icon: "map" },
  ],
  ranger: [
    { tab: "overview", title: "Beranda", icon: "grid" },
    { tab: "tasks", title: "Tugas Saya", icon: "file" },
    { tab: "findings", title: "Temuan Lapangan", icon: "radio" },
    { tab: "history", title: "Riwayat", icon: "history" },
    { tab: "map", title: "Peta Lingkungan", icon: "map" },
  ],
};

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    file: (
      <>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M15 3v5h4M9 12h7M9 16h7" />
      </>
    ),
    radio: (
      <>
        <circle cx="12" cy="12" r="2" />
        <path d="M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16" />
      </>
    ),
    map: (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2M17 7a3 3 0 0 1 0 6m1 2c2 1 3 2 3 5" />
      </>
    ),
    history: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l4 2" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4 shrink-0"
    >
      {paths[name] ?? paths.grid}
    </svg>
  );
}

const actionButton =
  "inline-flex min-h-9 items-center justify-center rounded-md bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-45";
const outlineButton =
  "inline-flex min-h-9 items-center justify-center rounded-md border border-line-strong bg-white px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-bg disabled:opacity-45";
const dateString = "31 Okt 2026 · 14:20 WITA";

function MetricStrip({
  cells,
}: {
  cells: { label: string; value: string | number; onClick?: () => void }[];
}) {
  return (
    <section
      aria-label="Ringkasan"
      className="mb-5 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4 gap-px"
    >
      {cells.map((cell, i) => (
        <button
          key={cell.label}
          type="button"
          onClick={cell.onClick}
          disabled={!cell.onClick}
          className={`min-w-0 bg-white p-4 text-left ${i === 0 ? "bg-brand-50" : ""} ${cell.onClick ? "hover:bg-brand-50" : "cursor-default"}`}
        >
          <span className="block text-xs font-medium text-muted">
            {cell.label}
          </span>
          <strong className="mt-1 block text-[28px] font-semibold text-ink">
            {cell.value}
          </strong>
        </button>
      ))}
    </section>
  );
}

function ObservationTable({
  items,
  onForward,
}: {
  items: DemoObservation[];
  onForward: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[540px] text-left text-[13px]">
        <thead className="border-b border-line bg-bg text-xs text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">ID / Observasi</th>
            <th className="px-4 py-3 font-medium">Sumber</th>
            <th className="px-4 py-3 font-medium">Kualitas</th>
            <th className="px-4 py-3 font-medium">Tindakan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-3">
                <span className="block text-[11px] text-muted">{o.id}</span>
                <strong className="font-semibold text-ink">{o.title}</strong>
              </td>
              <td className="px-4 py-3 text-muted">{o.source}</td>
              <td className="px-4 py-3">
                <span className="rounded-md bg-brand-50 px-2 py-1 text-xs text-brand">
                  {o.status === "forwarded"
                    ? "Diteruskan"
                    : o.status === "reviewed"
                      ? "Ditinjau"
                      : "Belum ditinjau"}
                </span>
              </td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onForward(o.id)}
                  disabled={o.status === "forwarded"}
                  className="text-xs font-semibold text-brand hover:underline disabled:opacity-40"
                >
                  Kirim ke Supervisor →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OperatorView({
  view,
  data,
  update,
  onTab,
}: {
  view: Tab;
  data: DemoState;
  update: (fn: (prev: DemoState) => DemoState) => void;
  onTab: (tab: Tab) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [domain, setDomain] =
    useState<DemoObservation["domain"]>("environmental_risk");
  const [source, setSource] = useState("Observasi manual");
  const forward = (id: string) =>
    update((prev) => ({
      ...prev,
      observations: prev.observations.map((o) =>
        o.id === id ? { ...o, status: "forwarded" as const } : o,
      ),
      caseStatus: "awaiting_decision",
      taskStatus: "assigned",
      finding: "",
      activity: [`Observasi ${id} dikirim kepada Supervisor`, ...prev.activity],
    }));
  const form = adding && (
    <form
      className="mb-5 grid gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        update((prev) => ({
          ...prev,
          observations: [
            {
              id: `OBS-${2051 + prev.observations.length - 3}`,
              title: title.trim().slice(0, 100),
              domain,
              source,
              status: "unreviewed" as const,
            },
            ...prev.observations,
          ],
          activity: ["Observasi baru dicatat oleh Operator", ...prev.activity],
        }));
        setTitle("");
        setAdding(false);
      }}
    >
      <label className="sm:col-span-2 text-xs font-semibold text-ink">
        Judul observasi
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          required
          placeholder="Judul observasi"
          className="mt-2 block w-full rounded-md border border-line-strong px-3 py-2 text-sm"
        />
      </label>
      <label className="text-xs font-semibold">
        Domain
        <select
          className="mt-2 block w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm"
          value={domain}
          onChange={(e) =>
            setDomain(e.target.value as DemoObservation["domain"])
          }
        >
          <option value="environmental_risk">Risiko lingkungan</option>
          <option value="biodiversity">Keanekaragaman hayati</option>
        </select>
      </label>
      <label className="text-xs font-semibold">
        Sumber
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="mt-2 block w-full rounded-md border border-line-strong px-3 py-2 text-sm"
        />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button className={actionButton} type="submit">
          Simpan observasi
        </button>
        <button
          className={outlineButton}
          type="button"
          onClick={() => setAdding(false)}
        >
          Batal
        </button>
      </div>
    </form>
  );
  if (view === "map")
    return (
      <>
        <Heading
          title="Peta lingkungan"
          note="Navigasi wilayah dan referensi spasial"
        />
        <RoleDemoMap />
      </>
    );
  if (view === "listen")
    return (
      <>
        <Heading
          title="Pemantauan LISTEN"
          note="Sumber bioakustik dan rekaman observasi"
        />
        <MetricStrip
          cells={[
            { label: "Sumber terdaftar", value: 1 },
            { label: "Rekaman historis", value: 6 },
            { label: "Perlu tinjauan", value: 1 },
            { label: "Case terkirim", value: 1 },
          ]}
        />
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="LISTEN-01 — Monitor perangkat">
            <div className="space-y-4 p-4 text-sm">
              <div className="flex items-center justify-between">
                <strong className="text-ink">listen-esp32-01</strong>
                <span className="rounded-md bg-bg px-2 py-1 text-xs text-muted">
                  Rekaman historis
                </span>
              </div>
              <div className="grid gap-2 rounded-md border border-line bg-bg p-4 text-xs">
                <span>Perangkat: ESP32 + mikrofon I2S</span>
                <span>Catatan terakhir: 30 Okt 2026, 13.01 WITA</span>
                <span>Status konektivitas: Tidak diketahui</span>
              </div>
              <button
                onClick={() => onTab("observations")}
                type="button"
                className={actionButton}
              >
                Tinjau bukti audio →
              </button>
            </div>
          </Panel>
          <Panel title="Observasi bioakustik">
            <div className="p-4 text-sm">
              <p className="font-semibold">Rekaman akustik pagi hari</p>
              <p className="mt-2 text-xs leading-6 text-muted">
                Sumber LISTEN-01 • kualitas belum ditinjau • analisis kandidat
                membutuhkan verifikasi manusia.
              </p>
              <button
                onClick={() => onTab("observations")}
                type="button"
                className={`${outlineButton} mt-4`}
              >
                Lihat observasi
              </button>
            </div>
          </Panel>
        </div>
      </>
    );
  if (view === "observations")
    return (
      <>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Heading
            title="Observasi"
            note="Daftar observasi dan tindak lanjut"
          />
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className={actionButton}
          >
            + Catat observasi
          </button>
        </div>
        {form}
        <Panel title="Daftar observasi">
          <ObservationTable items={data.observations} onForward={forward} />
        </Panel>
      </>
    );
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Heading title="Ringkasan observasi" />
        <button
          className={actionButton}
          onClick={() => {
            onTab("observations");
            setAdding(true);
          }}
          type="button"
        >
          + Catat observasi
        </button>
      </div>
      <MetricStrip
        cells={[
          {
            label: "Total observasi",
            value: data.observations.length,
            onClick: () => onTab("observations"),
          },
          {
            label: "Keanekaragaman hayati",
            value: data.observations.filter((o) => o.domain === "biodiversity")
              .length,
          },
          {
            label: "Risiko lingkungan",
            value: data.observations.filter(
              (o) => o.domain === "environmental_risk",
            ).length,
          },
          {
            label: "Belum ditinjau",
            value: data.observations.filter((o) => o.status === "unreviewed")
              .length,
          },
        ]}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <Panel title="Observasi terakhir diterima">
          <ObservationTable
            items={data.observations.slice(0, 4)}
            onForward={forward}
          />
        </Panel>
        <div className="space-y-5">
          <InfoCard title="Aktivitas Operator">
            <p>
              Periksa bukti LISTEN dan PREVENT, lalu teruskan observasi ke
              Supervisor.
            </p>
            <button
              type="button"
              onClick={() => onTab("listen")}
              className={`${outlineButton} mt-3`}
            >
              Buka LISTEN
            </button>
          </InfoCard>
          <InfoCard title="Perkembangan Case">
            <p className="font-semibold">CASE-2048</p>
            <p className="mt-1 text-muted">{CASE_LABEL[data.caseStatus]}</p>
            <Link
              href="/demo/supervisor"
              className="mt-3 inline-flex text-xs font-semibold text-brand hover:underline"
            >
              Buka workspace Supervisor →
            </Link>
          </InfoCard>
        </div>
      </div>
    </>
  );
}

function SupervisorView({
  view,
  data,
  update,
  onTab,
}: {
  view: Tab;
  data: DemoState;
  update: (fn: (prev: DemoState) => DemoState) => void;
  onTab: (tab: Tab) => void;
}) {
  const assign = () =>
    update((prev) => ({
      ...prev,
      caseStatus: "assigned",
      taskStatus: "assigned",
      finding: "",
      activity: [
        "Supervisor menugaskan verifikasi kepada Ranger",
        ...prev.activity,
      ],
    }));
  const close = () =>
    update((prev) => ({
      ...prev,
      caseStatus: "completed",
      taskStatus: "completed",
      activity: [
        "Supervisor menyelesaikan Case berdasarkan hasil lapangan",
        ...prev.activity,
      ],
    }));
  const caseCard = (
    <article className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-muted">
            CASE-2048 · 30 Okt 2026
          </p>
          <h3 className="mt-1 text-sm font-semibold text-ink">
            Indikasi termal area pengamatan
          </h3>
          <p className="mt-2 text-xs text-muted">
            Operator → Supervisor → Ranger
          </p>
        </div>
        <StatusChip status={data.caseStatus} />
      </div>
      <div className="mt-4 rounded-md border border-line bg-bg p-3 text-xs leading-6 text-muted">
        Observasi satelit dan catatan lingkungan memerlukan verifikasi lapangan
        sebelum ditutup sebagai hasil operasional.
      </div>
      {data.caseStatus === "awaiting_decision" && (
        <button
          onClick={assign}
          type="button"
          className={`${actionButton} mt-4`}
        >
          Setujui & tugaskan Ranger
        </button>
      )}
      {data.caseStatus === "assigned" && (
        <button
          onClick={() => onTab("tasks")}
          type="button"
          className={`${outlineButton} mt-4`}
        >
          Lihat progres Ranger →
        </button>
      )}
      {data.caseStatus === "submitted" && (
        <div className="mt-4">
          <p className="mb-3 rounded-md bg-brand-50 p-3 text-sm text-ink">
            Temuan Ranger: {data.finding}
          </p>
          <button onClick={close} className={actionButton} type="button">
            Evaluasi & tutup Case
          </button>
        </div>
      )}
      {data.caseStatus === "completed" && (
        <p className="mt-4 text-sm font-semibold text-brand">
          Hasil kasus telah ditutup.
        </p>
      )}
    </article>
  );
  if (view === "map")
    return (
      <>
        <PageHeading title="Peta lingkungan" />
        <RoleDemoMap />
      </>
    );
  if (view === "decisions")
    return (
      <>
        <PageHeading
          title="Antrean keputusan"
          desc="Observasi dan Case yang membutuhkan peninjauan"
        />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
          <Panel title="Antrean keputusan">{caseCard}</Panel>
          <InfoCard title="Ringkasan bukti">
            <p>
              Rekaman LISTEN dan referensi PREVENT dapat ditinjau sebelum
              keputusan. AI dan anomali satelit merupakan informasi pendukung.
            </p>
          </InfoCard>
        </div>
      </>
    );
  if (view === "assignments" || view === "tasks")
    return (
      <>
        <PageHeading
          title={view === "assignments" ? "Penugasan Ranger" : "Tugas Ranger"}
          desc="Koordinasi verifikasi lapangan dan evaluasi hasil"
        />
        <Panel title="Tugas verifikasi lapangan">
          <div className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">
                  TR-2048 — Verifikasi indikasi termal
                </h3>
                <p className="mt-1 text-xs text-muted">
                  Wilayah pemantauan • Ranger Lapangan
                </p>
              </div>
              <RangerStatus status={data.taskStatus} />
            </div>
            <p className="mt-3 text-sm text-muted">
              {data.finding ||
                "Periksa kondisi lapangan, dokumentasikan temuan dan keamanan lokasi."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.caseStatus === "awaiting_decision" && (
                <button type="button" onClick={assign} className={actionButton}>
                  Terbitkan penugasan
                </button>
              )}
              <Link href="/demo/ranger" className={outlineButton}>
                Buka Ranger →
              </Link>
              {data.caseStatus === "submitted" && (
                <button onClick={close} type="button" className={actionButton}>
                  Evaluasi & tutup
                </button>
              )}
            </div>
          </div>
        </Panel>
      </>
    );
  return (
    <>
      <PageHeading
        title="Ringkasan operasi"
        action={
          <button
            type="button"
            onClick={() => onTab("decisions")}
            className={actionButton}
          >
            Buka antrean keputusan →
          </button>
        }
      />
      <MetricStrip
        cells={[
          {
            label: "Menunggu keputusan",
            value: data.caseStatus === "awaiting_decision" ? 1 : 0,
            onClick: () => onTab("decisions"),
          },
          { label: "Dipantau", value: data.caseStatus === "assigned" ? 1 : 0 },
          {
            label: "Tugas aktif",
            value: ["assigned", "accepted", "in_progress"].includes(
              data.taskStatus,
            )
              ? 1
              : 0,
            onClick: () => onTab("tasks"),
          },
          {
            label: "Laporan masuk",
            value: data.caseStatus === "submitted" ? 1 : 0,
          },
        ]}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <Panel title="Antrean keputusan">{caseCard}</Panel>
        <div className="space-y-5">
          <InfoCard title="Aktivitas Ranger">
            <p className="font-semibold">Verifikasi indikasi termal</p>
            <p className="mt-1 text-muted">{TASK_LABEL[data.taskStatus]}</p>
            <button
              onClick={() => onTab("tasks")}
              className={`${outlineButton} mt-3`}
              type="button"
            >
              Lihat tugas
            </button>
          </InfoCard>
          <InfoCard title="Perlu perhatian">
            <p>
              Keputusan akhir memerlukan pemeriksaan manusia dan bukti yang
              relevan.
            </p>
          </InfoCard>
        </div>
      </div>
    </>
  );
}

function RangerView({
  view,
  data,
  update,
  onTab,
}: {
  view: Tab;
  data: DemoState;
  update: (fn: (prev: DemoState) => DemoState) => void;
  onTab: (tab: Tab) => void;
}) {
  const [finding, setFinding] = useState("");
  const transit = (status: DemoState["taskStatus"], detail: string) =>
    update((prev) => ({
      ...prev,
      taskStatus: status,
      activity: [detail, ...prev.activity],
    }));
  const submit = () => {
    if (!finding.trim()) return;
    update((prev) => ({
      ...prev,
      taskStatus: "submitted",
      caseStatus: "submitted",
      finding: finding.trim().slice(0, 500),
      activity: [
        "Ranger menyerahkan laporan lapangan kepada Supervisor",
        ...prev.activity,
      ],
    }));
    setFinding("");
  };
  const task = (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">#TR-2048 • Verifikasi lapangan</p>
          <h3 className="mt-2 text-[15px] font-semibold text-ink">
            Verifikasi indikasi termal wilayah pengamatan
          </h3>
        </div>
        <RangerStatus status={data.taskStatus} />
      </div>
      <p className="mt-2 text-xs text-muted">Ditugaskan: {dateString}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {data.taskStatus === "assigned" && (
          <button
            type="button"
            onClick={() =>
              transit("accepted", "Ranger menerima penugasan TR-2048")
            }
            className={actionButton}
          >
            Terima tugas
          </button>
        )}
        {data.taskStatus === "accepted" && (
          <button
            type="button"
            onClick={() =>
              transit("in_progress", "Ranger memulai pemeriksaan lapangan")
            }
            className={actionButton}
          >
            Mulai verifikasi
          </button>
        )}
        {data.taskStatus === "in_progress" && (
          <button
            type="button"
            onClick={() => onTab("findings")}
            className={actionButton}
          >
            Catat temuan lapangan
          </button>
        )}
        {data.taskStatus === "submitted" && (
          <Link href="/demo/supervisor" className={outlineButton}>
            Tinjau di Supervisor →
          </Link>
        )}
        {data.taskStatus === "completed" && (
          <span className="text-sm font-semibold text-brand">
            Tugas selesai
          </span>
        )}
      </div>
    </div>
  );
  if (view === "map")
    return (
      <>
        <Heading title="Peta Lingkungan" />
        <RoleDemoMap />
      </>
    );
  if (view === "history")
    return (
      <>
        <Heading title="Riwayat tugas" />
        <Panel title="Linimasa operasional">
          <ul className="divide-y divide-line">
            {data.activity.map((item) => (
              <li className="px-4 py-3 text-[13px] text-fg" key={item}>
                <span className="mr-3 text-brand">●</span>
                {item}
              </li>
            ))}
          </ul>
        </Panel>
      </>
    );
  if (view === "findings")
    return (
      <>
        <Heading
          title="Temuan Lapangan"
          note="Dokumentasikan pemeriksaan sebelum menyerahkan hasil"
        />
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <Panel title="Form temuan lapangan">
            <div className="space-y-3 p-4">
              <label
                className="block text-[13px] font-semibold"
                htmlFor="ranger-finding"
              >
                Catatan hasil pemeriksaan
              </label>
              <textarea
                id="ranger-finding"
                className="min-h-32 w-full rounded-md border border-line-strong bg-white p-3 text-sm"
                maxLength={500}
                value={finding}
                onChange={(e) => setFinding(e.target.value)}
                placeholder="Jelaskan kondisi yang ditemukan di lapangan"
                disabled={data.taskStatus !== "in_progress"}
              />
              <p className="text-xs text-muted">
                {finding.length}/500 karakter
              </p>
              <button
                type="button"
                className={actionButton}
                disabled={data.taskStatus !== "in_progress" || !finding.trim()}
                onClick={submit}
              >
                Kirim hasil kepada Supervisor
              </button>
              {data.taskStatus !== "in_progress" && (
                <p className="text-xs text-muted">
                  Terima dan mulai tugas lebih dahulu.
                </p>
              )}
              {data.finding && (
                <div className="rounded bg-brand-50 p-3 text-sm">
                  Hasil terakhir: {data.finding}
                </div>
              )}
            </div>
          </Panel>
          <SafetyPanel safety="Perhatikan kondisi lokasi sebelum memulai pemeriksaan." />
        </div>
      </>
    );
  if (view === "tasks")
    return (
      <>
        <Heading title="Tugas Saya" note="Tugas verifikasi dan tindak lanjut" />
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="Daftar tugas">{task}</Panel>
          <InfoCard title="Instruksi lapangan">
            <p>
              Periksa koordinat indikatif, validasi kondisi lokasi, catat temuan
              dan laporkan kepada Supervisor.
            </p>
          </InfoCard>
        </div>
        <div className="mt-5">
          <SafetyPanel safety="Keselamatan dan validasi manusia menjadi prioritas." />
        </div>
      </>
    );
  return (
    <>
      <Heading title="Beranda Ranger" note="Aktivitas dan penugasan lapangan" />
      <MetricStrip
        cells={[
          { label: "Tugas saya", value: 1, onClick: () => onTab("tasks") },
          {
            label: "Perlu ditindaklanjuti",
            value: ["assigned", "accepted", "in_progress"].includes(
              data.taskStatus,
            )
              ? 1
              : 0,
          },
          {
            label: "Laporan diajukan",
            value: data.taskStatus === "submitted" ? 1 : 0,
          },
          { label: "Selesai", value: data.taskStatus === "completed" ? 1 : 0 },
        ]}
      />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Tugas saya">{task}</Panel>
        <InfoCard title="Aktivitas lapangan">
          <p>
            Terima tugas dari Supervisor, lakukan verifikasi di lapangan, lalu
            kirim temuan beserta catatan pemeriksaan.
          </p>
          <button
            onClick={() => onTab("findings")}
            className={`${outlineButton} mt-3`}
            type="button"
          >
            Temuan Lapangan
          </button>
        </InfoCard>
      </div>
    </>
  );
}

export function RoleDemoWorkspace({ role }: { role: Role }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [data, setData] = useState<DemoState>(START);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (
          saved &&
          typeof saved === "object" &&
          "observations" in saved &&
          Array.isArray(saved.observations) &&
          "activity" in saved &&
          Array.isArray(saved.activity)
        )
          setData(saved as DemoState);
      }
    } catch {
      /* Storage may be unavailable; default in-memory flow remains usable. */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* In-memory flow still works. */
    }
  }, [data, loaded]);
  const update = (fn: (prev: DemoState) => DemoState) => setData(fn);
  const onTab = (value: Tab) => {
    setTab(value);
    setDrawer(false);
  };
  const menu = (
    <nav
      className="flex flex-1 flex-col gap-1 px-3 py-4"
      aria-label={`Navigasi ${ROLE_NAMES[role]}`}
    >
      <p className="mb-2 px-3 text-[10px] font-bold tracking-widest text-muted">
        WORKSPACE
      </p>
      {NAV[role].map((item) => (
        <button
          type="button"
          key={item.tab}
          aria-current={tab === item.tab ? "page" : undefined}
          onClick={() => onTab(item.tab)}
          className={`relative flex min-h-10 items-center gap-3 rounded-md px-3 text-left text-[13px] font-medium transition-colors ${tab === item.tab ? "bg-brand-50 text-ink before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:bg-brand" : "text-muted hover:bg-bg hover:text-ink"}`}
        >
          <NavIcon name={item.icon} />
          {item.title}
        </button>
      ))}
      <div className="mt-5 border-t border-line pt-4">
        <p className="mb-2 px-3 text-[10px] font-bold tracking-widest text-muted">
          PERAN
        </p>
        {(["operator", "supervisor", "ranger", "admin"] as const).map(
          (value) => (
            <Link
              key={value}
              href={`/demo/${value}`}
              onClick={() => setDrawer(false)}
              aria-current={role === value ? "page" : undefined}
              className={`flex min-h-9 items-center rounded-md px-3 text-[12px] ${role === value ? "font-semibold text-brand" : "text-muted hover:bg-bg"}`}
            >
              {value === "admin" ? "Admin / Organisasi" : ROLE_NAMES[value]}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-white transition-transform duration-200 lg:flex ${collapsed ? "-translate-x-full" : "translate-x-0"}`}
      >
        <Link
          href="/#solusi"
          className="flex h-14 shrink-0 items-center border-b border-line px-4"
          aria-label="Kembali ke Auvrion"
        >
          <SidebarBrandImage />
        </Link>
        {menu}
        <div className="border-t border-line p-3">
          <div className="rounded-md bg-bg px-3 py-2 text-xs">
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Organisasi
            </p>
            <p className="mt-1 font-semibold text-ink">Auvrion Development</p>
          </div>
          <div className="mt-3 flex items-center gap-2 px-1 text-xs font-medium">
            <span className="grid size-8 place-items-center rounded-full bg-brand-50 font-semibold text-brand">
              {ROLE_NAMES[role].slice(0, 1)}
            </span>
            {ROLE_NAMES[role]} Demo
          </div>
          <Link
            href="/#solusi"
            className="mt-3 block rounded-md px-2 py-2 text-xs text-muted hover:bg-bg"
          >
            ← Kembali ke landing
          </Link>
        </div>
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            aria-label="Tutup menu"
            className="absolute inset-0 bg-black/40"
            type="button"
            onClick={() => setDrawer(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <Link href="/#solusi" onClick={() => setDrawer(false)}>
                <SidebarBrandImage />
              </Link>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="rounded-md border border-line px-2 py-1"
                aria-label="Tutup navigasi"
              >
                ×
              </button>
            </div>
            {menu}
          </aside>
        </div>
      )}
      <div
        className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-0" : "lg:pl-[248px]"}`}
      >
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-line bg-white px-4 sm:px-6">
          <button
            type="button"
            className="grid size-9 place-items-center text-muted lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Buka navigasi"
          >
            <SidebarToggleIcon open={false} />
          </button>
          <button
            type="button"
            className="hidden size-9 place-items-center text-muted lg:grid"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
          >
            <SidebarToggleIcon open={!collapsed} />
          </button>
          <nav
            className="min-w-0 flex-1 truncate text-[13px] text-muted"
            aria-label="Breadcrumb"
          >
            {ROLE_NAMES[role]} <span className="mx-1 text-line-strong">/</span>
            <strong className="font-semibold text-ink">
              {NAV[role].find((item) => item.tab === tab)?.title}
            </strong>
          </nav>
          <span className="rounded-md border border-brand/15 bg-brand-50 px-2 py-1 text-[10px] font-bold tracking-wider text-brand">
            DEMO
          </span>
          <Link
            href="/#solusi"
            className="ml-1 hidden text-xs font-semibold text-muted hover:text-brand sm:inline"
          >
            Semua peran
          </Link>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-8 lg:pb-12">
          {role === "operator" ? (
            <OperatorView
              view={tab}
              data={data}
              update={update}
              onTab={onTab}
            />
          ) : role === "supervisor" ? (
            <SupervisorView
              view={tab}
              data={data}
              update={update}
              onTab={onTab}
            />
          ) : (
            <RangerView view={tab} data={data} update={update} onTab={onTab} />
          )}
          <div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-line pt-4">
            <Link
              href="/#solusi"
              className="text-xs font-semibold text-brand hover:underline"
            >
              ← Pilih peran lain
            </Link>
            <button
              type="button"
              onClick={() => {
                setData(START);
                setTab("overview");
              }}
              className="text-xs font-semibold text-muted hover:text-brand"
            >
              Atur ulang alur
            </button>
          </div>
        </main>
      </div>
      {role === "ranger" && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
          aria-label="Navigasi Ranger seluler"
        >
          {NAV.ranger.map((item) => (
            <button
              type="button"
              key={item.tab}
              onClick={() => onTab(item.tab)}
              className={`flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-[10px] ${tab === item.tab ? "text-brand" : "text-muted"}`}
            >
              <NavIcon name={item.icon} />
              <span className="truncate">
                {item.title === "Peta Lingkungan"
                  ? "Peta"
                  : item.title === "Temuan Lapangan"
                    ? "Temuan"
                    : item.title === "Tugas Saya"
                      ? "Tugas"
                      : item.title}
              </span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
