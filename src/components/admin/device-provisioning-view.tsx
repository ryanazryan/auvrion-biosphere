"use client";

import { SelectMenu } from "@/components/ui/SelectMenu";
import type { DeviceStatusFilter } from "./device-management-policy";
import {
  ListenDeviceIllustration,
  PreventDeviceIllustration,
} from "./device-provisioning-illustrations";

export type DeviceKind = "listen" | "prevent";
export type ProvisioningSource = {
  id: string;
  code: string;
  label: string;
  kind: string;
  isActive: boolean;
};
export type ProvisioningDevice = {
  id: string;
  sourceId: string;
  sourceCode: string;
  sourceLabel: string;
  sourceActive: boolean;
  status: "active" | "revoked";
  credentialVersion: number;
  createdAt: string;
  revokedAt: string | null;
  recordingCount: number;
  lastReceivedAt: string | null;
};

type Props = {
  organizationName: string;
  sources: ProvisioningSource[];
  devices: ProvisioningDevice[];
  filtered: ProvisioningDevice[];
  availableSources: ProvisioningSource[];
  kind: DeviceKind;
  onKindChange: (kind: DeviceKind) => void;
  sourceId: string;
  onSourceChange: (sourceId: string) => void;
  onProvision: () => void;
  onDetail: (deviceId: string) => void;
  onCopy: (value: string, item: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  filter: DeviceStatusFilter;
  onFilterChange: (filter: DeviceStatusFilter) => void;
  onRefresh: () => void;
};

const surface =
  "rounded-xl border border-[#e1e8e2] bg-white shadow-[0_2px_12px_rgba(20,45,37,0.025)]";
const field =
  "mt-1.5 flex min-h-10 items-center rounded-lg border border-[#dce5df] bg-[#fafcfb] px-3 text-[13px] text-[#24392f]";
const helper = "mt-1.5 text-[11px] leading-4 text-[#839088]";
const action =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#13775c] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#0e6049] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13775c]";
const outline =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#d6e3da] bg-white px-4 text-[13px] font-medium text-[#205b45] transition-colors hover:bg-[#f0f6f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13775c]";

function MiniIcon({
  name,
  size = 17,
}: {
  name:
    | "waves"
    | "flame"
    | "wifi"
    | "mic"
    | "sd"
    | "clock"
    | "shield"
    | "copy"
    | "plus"
    | "search"
    | "refresh"
    | "chevron"
    | "lock"
    | "info"
    | "check"
    | "location"
    | "cloud"
    | "server"
    | "key"
    | "activity"
    | "arrow"
    | "cpu";
  size?: number;
}) {
  const shapes = {
    waves: (
      <>
        <path d="M2 13v-2m4 6V7m4 13V4m4 13V7m4 6v-2m4 4V9" />
      </>
    ),
    flame: (
      <path d="M12 22c-5 0-8-3.4-8-8 0-3.4 2.7-6.2 5.4-9.8-.2 3.1 1.6 4.2 1.6 4.2C11.4 5.9 14 4 14.1 2c4.7 4.5 6.2 8 6.2 12.5 0 4.4-3 7.5-8.3 7.5Z" />
    ),
    wifi: (
      <>
        <path d="M2 8a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8 16a5 5 0 0 1 8 0" />
        <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 12a7 7 0 0 0 14 0M12 18v4M8 22h8" />
      </>
    ),
    sd: (
      <>
        <path d="M7 2h7l5 5v15H5V4l2-2Z" />
        <path d="M9 3v5h6V4M8 17h8" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    shield: (
      <>
        <path d="M12 2 20 6v6c0 5-3 8-8 10-5-2-8-5-8-10V6l8-4Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v6h-6" />
      </>
    ),
    chevron: <path d="m7 10 5 5 5-5" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    check: <path d="m5 12 4.5 4.5L19 7" />,
    location: (
      <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    cloud: (
      <>
        <path d="M7 19h11a4 4 0 0 0 0-8h-1a6 6 0 0 0-11-1 4.5 4.5 0 0 0 1 9Z" />
      </>
    ),
    server: (
      <>
        <rect x="3" y="3" width="18" height="7" rx="2" />
        <rect x="3" y="14" width="18" height="7" rx="2" />
        <path d="M7 6.5h.01M7 17.5h.01M11 6.5h7M11 17.5h7" />
      </>
    ),
    key: (
      <>
        <circle cx="8" cy="15" r="4" />
        <path d="M11 12 20 3l2 2-2 2 1.5 1.5-3 3-1.5-1.5-4.5 4.5" />
      </>
    ),
    activity: (
      <>
        <path d="M3 12h5l3-7 3 14 3-7h4" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    cpu: (
      <>
        <rect x="5" y="5" width="14" height="14" rx="2" />
        <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes[name]}
    </svg>
  );
}

function ReadField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-[#536658]">{label}</p>
      <div className={`${field} min-w-0 truncate`} title={value}>
        {value}
      </div>
      {hint && <p className={helper}>{hint}</p>}
    </div>
  );
}

function StatusRow({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "good" | "warn";
}) {
  const t =
    tone === "good"
      ? "text-[#13795a]"
      : tone === "warn"
        ? "text-[#a1732a]"
        : "text-[#718076]";
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#edf0ed] py-2.5 text-[12px] last:border-0">
      <span className="text-[#53685a]">{label}</span>
      <span className={`text-right font-medium ${t}`}>{value}</span>
    </div>
  );
}

function DeviceBadge({
  status,
  inactiveSource = false,
}: {
  status: "active" | "revoked";
  inactiveSource?: boolean;
}) {
  const bad = status === "revoked" || inactiveSource;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${bad ? "text-[#9a5b59]" : "text-[#167658]"}`}
    >
      <span
        className={`size-1.5 rounded-full ${bad ? "bg-[#b27d7c]" : "bg-[#238567]"}`}
      />
      {status === "revoked"
        ? "Akses dicabut"
        : inactiveSource
          ? "Sumber nonaktif"
          : "Terdaftar"}
    </span>
  );
}

function toWita(value: string | null): string {
  if (!value) return "Belum ada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tidak valid";
  return `${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar", hour12: false }).format(date)} WITA`;
}

function StepBar() {
  const steps = [
    {
      id: "identitas",
      title: "Identitas",
      detail: "Informasi dasar perangkat",
    },
    { id: "kredensial", title: "Kredensial", detail: "Token & keamanan" },
    {
      id: "konektivitas",
      title: "Konektivitas",
      detail: "Sinkronisasi & lokasi",
    },
    { id: "aktivasi", title: "Aktivasi", detail: "Tinjau & daftarkan" },
  ] as const;
  return (
    <nav
      aria-label="Tahapan provisioning"
      className={`${surface} overflow-hidden`}
    >
      <ol className="grid grid-cols-2 gap-px bg-[#e5ebe5] lg:grid-cols-4">
        {steps.map((step, index) => (
          <li key={step.id} className="min-w-0 bg-white">
            <a
              href={`#${step.id}`}
              className="flex min-h-16 items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-[#f5f9f6] focus-visible:outline-2 focus-visible:outline-[#20785f] sm:px-4"
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${index === 0 ? "bg-[#15785d] text-white" : "border border-[#e2e9e4] bg-[#f6f8f7] text-[#617065]"}`}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-[#1e3026]">
                  {step.title}
                </span>
                <span className="block truncate text-[10px] text-[#849188]">
                  {step.detail}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function DeviceProvisioningView({
  organizationName,
  sources,
  devices,
  filtered,
  availableSources,
  kind,
  onKindChange,
  sourceId,
  onSourceChange,
  onProvision,
  onDetail,
  onCopy,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  onRefresh,
}: Props) {
  const listen = kind === "listen";
  const selectedSource =
    sources.find((source) => source.id === sourceId) ?? null;
  const selectedDevice =
    devices.find((device) => device.sourceId === sourceId) ?? null;
  const latestDevice =
    devices.find((d) => d.status === "active") ?? devices[0] ?? null;
  const currentDevice = selectedDevice ?? latestDevice;
  const count = devices.reduce((acc, d) => acc + d.recordingCount, 0);
  const plannedVisible =
    filter === "all" &&
    (!query.trim() ||
      "prevent direncanakan belum dirakit".includes(
        query.trim().toLowerCase(),
      ));

  return (
    <div className="space-y-4 text-[#26362d]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[25px] font-semibold tracking-[-0.025em] text-[#182820] sm:text-[29px]">
            Provisioning perangkat
          </h1>
          <p className="mt-1 text-[13px] text-[#6d7c71]">
            Identitas dan keamanan perangkat lingkungan Auvrion: LISTEN dan
            PREVENT.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#d6e4da] bg-white px-3 py-1.5 text-[11px] font-medium text-[#557465]">
          <MiniIcon name="shield" size={14} /> Terbatas untuk Administrator
        </span>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_335px]">
        <div className="min-w-0 space-y-4">
          <StepBar />

          <section
            id="identitas"
            className={`${surface} scroll-mt-24 p-4 sm:p-5`}
          >
            <h2 className="mb-4 text-[14px] font-semibold text-[#1f2d24]">
              Informasi perangkat
            </h2>
            <div className="grid gap-x-4 gap-y-4 sm:grid-cols-3">
              <div>
                <p className="text-[12px] font-medium text-[#536658]">
                  Jenis perangkat
                </p>
                <div className="mt-1.5">
                  <SelectMenu
                    label="Jenis perangkat"
                    value={kind}
                    onChange={(value) =>
                      onKindChange(value === "prevent" ? "prevent" : "listen")
                    }
                    options={[
                      { value: "listen", label: "LISTEN — bioakustik" },
                      { value: "prevent", label: "PREVENT — lingkungan" },
                    ]}
                  />
                </div>
                <p className={helper}>
                  {listen
                    ? "Perangkat bioakustik ESP32"
                    : "Rencana sensor risiko karhutla"}
                </p>
              </div>
              <ReadField
                label="Kode perangkat"
                value={
                  listen
                    ? (selectedSource?.code ??
                      (availableSources.length === 0
                        ? currentDevice?.sourceCode
                        : undefined) ??
                      "Pilih sumber")
                    : "Belum diterbitkan"
                }
                hint={
                  listen
                    ? "Kode berasal dari sumber di database"
                    : "Tidak ada Device ID PREVENT"
                }
              />
              <ReadField
                label="Label perangkat"
                value={
                  listen
                    ? (selectedSource?.label ??
                      (availableSources.length === 0
                        ? currentDevice?.sourceLabel
                        : undefined) ??
                      "Pilih sumber")
                    : "Auvrion PREVENT (rencana)"
                }
                hint={
                  listen
                    ? "Identitas pada data sumber"
                    : "Bukan perangkat terdaftar"
                }
              />
              <ReadField
                label="Organisasi"
                value={organizationName}
                hint="Otomatis dari sesi Admin"
              />
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-[#536658]">
                  Sumber observasi
                </p>
                {listen ? (
                  <div className="mt-1.5">
                    <SelectMenu
                      label="Sumber observasi LISTEN yang tersedia"
                      value={
                        availableSources.some(
                          (source) => source.id === sourceId,
                        )
                          ? sourceId
                          : ""
                      }
                      onChange={onSourceChange}
                      options={[
                        {
                          value: "",
                          label:
                            availableSources.length > 0
                              ? "Pilih sumber LISTEN"
                              : "Tidak ada sumber LISTEN baru",
                        },
                        ...availableSources.map((source) => ({
                          value: source.id,
                          label: source.label,
                          description: source.code,
                        })),
                      ]}
                    />
                  </div>
                ) : (
                  <div className={field}>Belum tersedia untuk PREVENT</div>
                )}
                <p className={helper}>
                  {listen
                    ? "Hanya sumber aktif yang belum diprovisioning"
                    : "Provisioning PREVENT belum didukung backend"}
                </p>
              </div>
              <ReadField
                label="Zona / wilayah operasi"
                value="Belum dicatat"
                hint="Belum ada kolom lokasi perangkat di registri"
              />
              <ReadField
                label="Koordinat pemasangan"
                value="Belum dicatat"
                hint="Tidak mengarang titik lokasi"
              />
              <ReadField
                label="SSID Wi-Fi"
                value="Dikelola di firmware lokal"
                hint="Tidak disimpan atau ditampilkan di halaman Admin"
              />
            </div>
            {listen && !selectedSource && availableSources.length === 0 && (
              <p className="mt-4 rounded-lg border border-[#eadfbd] bg-[#fdfaf1] px-3 py-2 text-[12px] text-[#8b6a2f]">
                Tidak ada sumber LISTEN baru yang dapat didaftarkan. Pilih
                perangkat terdaftar pada tabel untuk melihat detail atau
                merotasi token.
              </p>
            )}
          </section>

          <section
            id="kredensial"
            className={`${surface} scroll-mt-24 p-4 sm:p-5`}
          >
            <h2 className="mb-4 text-[14px] font-semibold text-[#1f2d24]">
              Kredensial & koneksi
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[12px] font-medium text-[#536658]">
                  Token perangkat
                </p>
                <div className={`${field} justify-between gap-2`}>
                  <span className="flex items-center gap-2 text-[#74847a]">
                    <MiniIcon name="lock" size={15} />
                    {listen ? "Rahasia · sekali tampil" : "Belum tersedia"}
                  </span>
                  <span className="rounded bg-[#edf4ef] px-2 py-1 text-[10px] text-[#476d57]">
                    Server-issued
                  </span>
                </div>
                <p className={helper}>
                  Token hanya muncul setelah registrasi / rotasi berhasil, bukan
                  dari database.
                </p>
              </div>
              <div>
                <p className="text-[12px] font-medium text-[#536658]">
                  Rute unggah HTTPS
                </p>
                <div className={`${field} gap-2 pr-1`}>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                    /api/device/recordings
                  </span>
                  <button
                    type="button"
                    aria-label="Salin rute API"
                    className="rounded-md border border-[#dce5df] bg-white p-2 text-[#23694f] hover:bg-[#edf5ef]"
                    onClick={() => onCopy("/api/device/recordings", "Rute API")}
                  >
                    <MiniIcon name="copy" size={15} />
                  </button>
                </div>
                <p className={helper}>
                  Perlu domain HTTPS publik yang valid; ini hanya path API.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[#e7ede8] p-3">
                <div className="flex items-center gap-2 text-[#2d7057]">
                  <MiniIcon name="shield" size={17} />
                  <span className="text-xs font-medium">Sertifikat CA</span>
                </div>
                <p className="mt-2 text-[12px] font-semibold">
                  Dikelola firmware
                </p>
                <p className={helper}>Belum diverifikasi oleh server</p>
              </div>
              <div className="rounded-lg border border-[#e7ede8] p-3">
                <div className="flex items-center gap-2 text-[#2d7057]">
                  <MiniIcon name="clock" size={17} />
                  <span className="text-xs font-medium">RTC / NTP</span>
                </div>
                <p className="mt-2 text-[12px] font-semibold">
                  Status tidak tersedia
                </p>
                <p className={helper}>Tidak ada heartbeat perangkat</p>
              </div>
              <div className="rounded-lg border border-[#e7ede8] p-3">
                <div className="flex items-center gap-2 text-[#2d7057]">
                  <MiniIcon name="sd" size={17} />
                  <span className="text-xs font-medium">Penyimpanan</span>
                </div>
                <p className="mt-2 text-[12px] font-semibold">
                  Status tidak tersedia
                </p>
                <p className={helper}>
                  {listen
                    ? "microSD dicek pada firmware"
                    : "Rencana desain perangkat"}
                </p>
              </div>
            </div>
          </section>

          <section
            id="konektivitas"
            className={`${surface} scroll-mt-24 p-4 sm:p-5`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[14px] font-semibold">
                Konektivitas & penerimaan
              </h2>
              <span className="rounded-full border border-[#e6e6d9] bg-[#fbfaf4] px-2.5 py-1 text-[11px] text-[#89764b]">
                Tidak ada heartbeat terverifikasi
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-[#f7faf7] p-3">
                <p className="text-[11px] text-[#748579]">Koneksi live</p>
                <p className="mt-1 text-[13px] font-semibold">
                  Tidak diketahui
                </p>
              </div>
              <div className="rounded-lg bg-[#f7faf7] p-3">
                <p className="text-[11px] text-[#748579]">Rekaman diterima</p>
                <p className="mt-1 text-[13px] font-semibold tabular-nums">
                  {listen ? `${count} rekaman` : "Belum tersedia"}
                </p>
              </div>
              <div className="rounded-lg bg-[#f7faf7] p-3">
                <p className="text-[11px] text-[#748579]">
                  Penerimaan terakhir
                </p>
                <p className="mt-1 text-[12px] font-semibold">
                  {listen
                    ? toWita(currentDevice?.lastReceivedAt ?? null)
                    : "Belum ada"}
                </p>
              </div>
            </div>
          </section>

          <section
            id="aktivasi"
            className={`${surface} scroll-mt-24 p-4 sm:p-5`}
          >
            <h2 className="text-[14px] font-semibold">
              Tinjau & aktivasi identitas
            </h2>
            <p className="mt-2 text-[12px] leading-5 text-[#6a7a6f]">
              {listen
                ? "Pendaftaran menerbitkan Device ID dan token sekali tampil. Penerbitan token bukan bukti perangkat online; unggah rekaman baru dianggap berhasil hanya setelah backend menerima dan mengakui data."
                : "PREVENT masih dalam tahap perencanaan. Tidak ada perangkat fisik atau kredensial aktif yang dapat diaktifkan melalui API LISTEN."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className={action}
                type="button"
                disabled={!listen || availableSources.length === 0}
                onClick={onProvision}
              >
                <MiniIcon name="plus" size={16} />
                {listen
                  ? "Daftarkan & terbitkan token"
                  : "Provisioning belum tersedia"}
              </button>
              {listen && currentDevice && (
                <button
                  className={outline}
                  type="button"
                  onClick={() => onDetail(currentDevice.id)}
                >
                  Detail perangkat terdaftar <MiniIcon name="arrow" size={15} />
                </button>
              )}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Ringkasan perangkat">
          <section className={`${surface} overflow-hidden p-4 sm:p-5`}>
            <fieldset
              aria-label="Model perangkat Auvrion"
              className="flex items-center gap-2 border-b border-[#e8eee9] pb-3"
            >
              <button
                type="button"
                aria-pressed={listen}
                onClick={() => onKindChange("listen")}
                className={`flex-1 rounded-md px-3 py-2 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#20785f] ${listen ? "bg-[#e7f4ec] text-[#116d52]" : "text-[#708075] hover:bg-[#f5f8f6]"}`}
              >
                LISTEN
              </button>
              <button
                type="button"
                aria-pressed={!listen}
                onClick={() => onKindChange("prevent")}
                className={`flex-1 rounded-md px-3 py-2 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#20785f] ${!listen ? "bg-[#e7f4ec] text-[#116d52]" : "text-[#708075] hover:bg-[#f5f8f6]"}`}
              >
                PREVENT
              </button>
            </fieldset>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-[#182c20]">
                  Auvrion {listen ? "LISTEN" : "PREVENT"}
                </h2>
                <p className="mt-1 max-w-[255px] text-[12px] leading-5 text-[#64766a]">
                  {listen
                    ? "Perangkat bioakustik berbasis ESP32 untuk merekam suara lingkungan."
                    : "Konsep perangkat sensor lingkungan untuk dukungan deteksi dini risiko karhutla."}
                </p>
              </div>
            </div>
            <div className="relative mt-2 grid min-h-[188px] place-items-center overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,#ecf5ef_0%,#f6faf6_58%,#ffffff_85%)]">
              {listen ? (
                <ListenDeviceIllustration />
              ) : (
                <PreventDeviceIllustration />
              )}
            </div>
            <p className="mt-1 text-center text-[10px] text-[#91a095]">
              Ilustrasi konsep isometrik · bukan foto perangkat terpasang
            </p>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-[11px] text-[#516b5b]">
              {listen ? (
                <>
                  <span className="flex items-center gap-2">
                    <MiniIcon name="wifi" size={15} /> ESP32 Wi-Fi
                  </span>
                  <span className="flex items-center gap-2">
                    <MiniIcon name="mic" size={15} /> INMP441
                  </span>
                  <span className="flex items-center gap-2">
                    <MiniIcon name="sd" size={15} /> microSD
                  </span>
                  <span className="flex items-center gap-2">
                    <MiniIcon name="clock" size={15} /> DS3231 RTC
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-2">
                    <MiniIcon name="cpu" size={15} /> ESP32 (rencana)
                  </span>
                  <span className="flex items-center gap-2">
                    <MiniIcon name="activity" size={15} /> BME280 (rencana)
                  </span>
                  <span className="flex items-center gap-2">
                    <MiniIcon name="cloud" size={15} /> Sensor udara
                  </span>
                  <span className="flex items-center gap-2">
                    <MiniIcon name="shield" size={15} /> Enclosure
                  </span>
                </>
              )}
            </div>
          </section>

          <section className={`${surface} p-4 sm:p-5`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[14px] font-semibold">Status perangkat</h2>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${listen ? "bg-[#edf5ef] text-[#39785e]" : "bg-[#fff5e8] text-[#a36c2d]"}`}
              >
                {listen
                  ? devices.some((d) => d.status === "active")
                    ? "Registrasi aktif"
                    : "Belum didaftarkan"
                  : "Belum dirakit"}
              </span>
            </div>
            {listen ? (
              <>
                <StatusRow
                  label="Perangkat terdaftar"
                  value={`${devices.length}`}
                />
                <StatusRow label="Koneksi Wi-Fi" value="Tidak diketahui" />
                <StatusRow label="RTC / NTP" value="Tidak dilaporkan" />
                <StatusRow label="microSD" value="Tidak dilaporkan" />
                <StatusRow
                  label="Rekaman diterima"
                  value={`${count}`}
                  tone={count > 0 ? "good" : "muted"}
                />
                <StatusRow
                  label="Penerimaan backend terakhir"
                  value={toWita(currentDevice?.lastReceivedAt ?? null)}
                  tone={count > 0 ? "good" : "muted"}
                />
              </>
            ) : (
              <>
                <StatusRow
                  label="Perakitan prototipe"
                  value="Belum dimulai"
                  tone="warn"
                />
                <StatusRow label="Device ID" value="Belum diterbitkan" />
                <StatusRow
                  label="Koneksi / pengukuran"
                  value="Belum tersedia"
                />
                <StatusRow
                  label="Backend PREVENT"
                  value="Belum diimplementasikan"
                />
                <StatusRow label="Data lingkungan" value="Belum ada" />
              </>
            )}
          </section>
          <section className={`${surface} p-4`}>
            <p className="flex items-center gap-2 text-[12px] font-semibold text-[#2b5542]">
              <MiniIcon name="info" size={16} /> Catatan integrasi
            </p>
            <p className="mt-2 text-[11px] leading-5 text-[#68796d]">
              {listen
                ? "Status registrasi tidak sama dengan online. Periksa firmware ESP32 dan ACK unggahan WAV untuk validasi end-to-end."
                : "PREVENT ditampilkan sebagai roadmap produk. Registrasi, telemetri, dan endpoint ingestion belum dinyatakan selesai."}
            </p>
          </section>
        </aside>
      </div>

      <section
        id="perangkat-terdaftar"
        className={`${surface} overflow-hidden`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ece8] p-4 sm:px-5">
          <div>
            <h2 className="text-[14px] font-semibold text-[#1e3026]">
              Perangkat terdaftar & rencana
            </h2>
            <p className="mt-0.5 text-[11px] text-[#79887c]">
              {devices.length} perangkat terdaftar · 1 jenis dalam rencana
              (PREVENT)
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="flex min-h-10 min-w-[190px] flex-1 items-center gap-2 rounded-lg border border-[#dbe5dd] px-3 text-[#637e70] focus-within:border-[#20785f] focus-within:ring-2 focus-within:ring-[#20785f]/10">
              <MiniIcon name="search" size={16} />
              <input
                className="w-full min-w-0 border-0 bg-transparent text-[12px] text-[#263a2e] outline-none"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Cari kode atau perangkat..."
                aria-label="Cari perangkat"
              />
            </label>
            <div className="min-w-[135px] flex-1 sm:flex-none">
              <SelectMenu
                label="Filter status perangkat"
                value={filter}
                onChange={onFilterChange}
                options={[
                  { value: "all", label: "Semua status" },
                  { value: "active", label: "Terdaftar" },
                  { value: "revoked", label: "Dicabut" },
                ]}
              />
            </div>
            <button
              type="button"
              title="Muat ulang"
              aria-label="Muat ulang daftar"
              className={`${outline} px-3`}
              onClick={onRefresh}
            >
              <MiniIcon name="refresh" size={16} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[790px] text-left text-[12px]">
            <thead className="bg-[#f8faf8] text-[#6d7e70]">
              <tr>
                <th className="px-5 py-3 font-semibold">Kode / ID</th>
                <th className="px-4 py-3 font-semibold">Label perangkat</th>
                <th className="px-4 py-3 font-semibold">Jenis</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Rekaman</th>
                <th className="px-4 py-3 font-semibold">Terakhir diterima</th>
                <th className="px-4 py-3 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0ec]">
              {filtered.map((device) => (
                <tr key={device.id} className="hover:bg-[#fbfcfb]">
                  <td className="px-5 py-3">
                    <span className="font-medium text-[#24382e]">
                      {device.sourceCode}
                    </span>
                    <span
                      className="mt-0.5 block max-w-[140px] truncate font-mono text-[10px] text-[#89988c]"
                      title={device.id}
                    >
                      {device.id}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#2b4235]">
                    {device.sourceLabel}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <MiniIcon name="waves" size={15} /> LISTEN
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <DeviceBadge
                      status={device.status}
                      inactiveSource={!device.sourceActive}
                    />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {device.recordingCount}
                  </td>
                  <td className="px-4 py-3 text-[#66796c]">
                    {toWita(device.lastReceivedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDetail(device.id)}
                      className="rounded-md px-2 py-1.5 font-semibold text-[#147156] hover:bg-[#eaf4ed]"
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
              {plannedVisible && (
                <tr className="bg-[#fdfdfb]">
                  <td className="px-5 py-3 text-[#8e978e]">—</td>
                  <td className="px-4 py-3 font-medium text-[#2b4235]">
                    Auvrion PREVENT (rencana)
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <MiniIcon name="flame" size={15} /> PREVENT
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[#fff4e4] px-2 py-1 text-[11px] font-medium text-[#9a6a2f]">
                      Belum dirakit
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[#8e978e]">—</td>
                  <td className="px-4 py-3 text-[#8e978e]">—</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        onKindChange("prevent");
                        document.getElementById("identitas")?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }}
                      className="rounded-md px-2 py-1.5 font-medium text-[#567967] hover:bg-[#edf4ef]"
                    >
                      Lihat rencana
                    </button>
                  </td>
                </tr>
              )}
              {filtered.length === 0 && !plannedVisible && (
                <tr>
                  <td
                    className="px-5 py-8 text-center text-[#89958a]"
                    colSpan={7}
                  >
                    Tidak ada perangkat yang sesuai pencarian dan filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
