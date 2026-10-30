"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";

type Category = "all" | "listen_device" | "prevent_device";
type Device = {
  sourceId: string;
  kind: "listen_device" | "prevent_device";
  code: string;
  label: string;
  sourceActive: boolean;
  deviceId: string | null;
  deviceStatus: "active" | "revoked" | null;
  credentialVersion: number | null;
  locationLabel: string | null;
  locationDisclosureApproved: boolean | null;
  recordingCount: number | null;
  lastRecordingAt?: string | null;
};
type Inventory = {
  organizationId: string;
  organizationName: string;
  devices: Device[];
};
const PAGE_SIZE = 8;

function MiniIcon({
  name,
  className = "",
}: {
  name:
    | "device"
    | "listen"
    | "prevent"
    | "record"
    | "search"
    | "pin"
    | "refresh"
    | "plus"
    | "chevron";
  className?: string;
}) {
  const p = {
    device: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M8 9h8v6H8zM12 2v3" />
      </>
    ),
    listen: (
      <>
        <path d="M2 9a15 15 0 0 1 20 0M5 12a10.5 10.5 0 0 1 14 0M8 15a6 6 0 0 1 8 0M12 19h.01" />
      </>
    ),
    prevent: (
      <>
        <path d="M12 2 4 6v6c0 5 3 8 8 10 5-2 8-5 8-10V6l-8-4Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    record: (
      <>
        <path d="M7 3h8l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path d="M15 3v6h5M9 13h7M9 17h7" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    refresh: (
      <>
        <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" />
        <path d="M3 21v-5h5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    chevron: <path d="m9 18 6-6-6-6" />,
  };
  return (
    <svg
      aria-hidden="true"
      className={`size-5 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {p[name]}
    </svg>
  );
}

export function DeviceIllustration({
  kind,
  large = false,
}: {
  kind: Device["kind"];
  large?: boolean;
}) {
  const listen = kind === "listen_device";
  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-xl ${listen ? "bg-[#f1f6f2]" : "bg-[#f0f6f8]"} ${large ? "size-32 sm:size-36" : "size-[67px] sm:size-[74px]"}`}
    >
      <Image
        src={
          listen
            ? "/device-illustrations/listen-device.png"
            : "/device-illustrations/prevent-device.png"
        }
        alt={
          listen
            ? "Ilustrasi konsep perangkat LISTEN"
            : "Ilustrasi konsep perangkat PREVENT"
        }
        width={large ? 150 : 104}
        height={large ? 150 : 104}
        className="h-full w-full object-contain p-1.5"
      />
    </div>
  );
}

function DeviceStatus({ device }: { device: Device }) {
  if (device.kind === "prevent_device" && !device.deviceId) {
    return (
      <span className="inline-flex w-max shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#f3f5f6] px-3 py-1.5 text-xs font-semibold text-[#586d72]">
        <span className="size-2 rounded-full bg-[#91a0a5]" />
        Integrasi belum tersedia
      </span>
    );
  }
  if (device.deviceStatus === "active")
    return (
      <span className="inline-flex w-max shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#eaf8ef] px-2.5 py-1.5 text-[11px] font-semibold text-[#127042]">
        <span className="size-2 rounded-full bg-[#15864d]" />
        Aktif
      </span>
    );
  if (device.deviceStatus === "revoked")
    return (
      <span className="inline-flex w-max shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#fff1f1] px-3 py-1.5 text-xs font-semibold text-[#b03b3b]">
        <span className="size-2 rounded-full bg-[#ca4b4b]" />
        Dicabut
      </span>
    );
  return (
    <span className="inline-flex w-max shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#fff5e5] px-3 py-1.5 text-xs font-semibold text-[#935e16]">
      <span className="size-2 rounded-full bg-[#e1a23f]" />
      Belum diprovision
    </span>
  );
}

function Metric({
  label,
  value,
  icon,
  iconClass = "bg-[#edf7f1] text-[#19785a]",
}: {
  label: string;
  value: number | string;
  icon: "device" | "listen" | "prevent" | "record";
  iconClass?: string;
}) {
  return (
    <div className="flex min-h-[104px] items-center gap-4 rounded-xl border border-line bg-white p-4">
      <div
        className={`grid size-12 shrink-0 place-items-center rounded-xl ${iconClass}`}
      >
        <MiniIcon name={icon} className="size-6" />
      </div>
      <div className="min-w-0">
        <p className="text-xs leading-5 text-[#65776c]">{label}</p>
        <p className="mt-1 text-[29px] font-semibold leading-none tracking-tight text-[#122c24] tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}

function Row({ device }: { device: Device }) {
  const listen = device.kind === "listen_device";
  const routeId = encodeURIComponent(device.deviceId ?? device.sourceId);
  const detailLink = `/admin/devices/${routeId}`;
  const locationLink =
    listen && device.deviceId
      ? `/admin/listen-locations?deviceId=${encodeURIComponent(device.deviceId)}`
      : null;
  const formattedTime = device.lastRecordingAt
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Makassar",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(device.lastRecordingAt))
    : null;

  return (
    <article
      aria-label={device.label}
      className="grid min-w-0 grid-cols-1 items-center gap-3 rounded-xl border border-[#e6ece8] bg-white px-3 py-3 transition-colors hover:border-[#c1daca] sm:grid-cols-2 xl:grid-cols-[minmax(170px,1.6fr)_minmax(75px,.65fr)_minmax(130px,.9fr)_minmax(120px,1fr)_minmax(105px,.85fr)_minmax(150px,1.2fr)] xl:gap-x-2 xl:gap-y-0"
    >
      <div className="flex min-w-0 items-center gap-3">
        <DeviceIllustration kind={device.kind} />
        <div className="min-w-0">
          <Link
            href={detailLink}
            title={device.label}
            className="block break-words text-[13px] font-semibold leading-5 text-[#21352d] hover:text-[#127456] hover:underline"
          >
            {device.label}
          </Link>
          <p className="mt-1 break-all text-xs text-[#708077]">{device.code}</p>
          <p className="mt-0.5 text-[11px] text-[#94a39a]">
            {listen ? "Bioakustik" : "Pemantauan risiko"}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-[11px] text-[#829089]">Jenis perangkat</p>
        <span
          className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${listen ? "bg-[#e9f4ed] text-[#126b4e]" : "bg-[#e7f1fb] text-[#246c9b]"}`}
        >
          {listen ? "LISTEN" : "PREVENT"}
        </span>
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-[11px] text-[#829089]">Status</p>
        <DeviceStatus device={device} />
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-[11px] text-[#829089]">Lokasi</p>
        <p className="flex items-start gap-1.5 text-xs font-medium leading-5 text-[#273c32]">
          <MiniIcon name="pin" className="size-4 text-[#61776b]" />
          <span className="break-words">
            {device.locationLabel || "Belum dicatat"}
          </span>
        </p>
        {locationLink ? (
          <Link
            href={locationLink}
            className="ml-[22px] mt-0.5 inline-block text-[11px] font-medium text-[#18765a] hover:underline"
          >
            Atur lokasi
          </Link>
        ) : (
          <span className="mt-1 block text-[11px] text-muted">
            {listen ? "Belum diprovision" : "Belum didukung"}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-[11px] text-[#829089]">Data terbaru</p>
        <p className="text-xs font-semibold text-[#273c32]">
          {listen ? `${device.recordingCount ?? 0} WAV` : "Belum tersedia"}
        </p>
        <p className="mt-1 text-[10px] leading-4 text-[#90a096]">
          {listen
            ? (formattedTime ?? "Belum ada rekaman")
            : "Menunggu integrasi"}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Link
          href={detailLink}
          className="inline-flex min-h-9 items-center justify-center rounded-md bg-[#147a5b] px-2 py-1.5 text-center text-[11px] font-semibold text-white hover:bg-[#0f6349]"
        >
          Detail & edit perangkat
        </Link>
        {locationLink ? (
          <Link
            href={locationLink}
            className="inline-flex min-h-9 items-center justify-center rounded-md border border-[#c4ddcf] bg-[#eef7f1] px-2 py-1.5 text-center text-[11px] font-semibold text-[#176d50] hover:bg-[#e1f1e7]"
          >
            Atur lokasi pemasangan
          </Link>
        ) : (
          <span className="inline-flex min-h-9 items-center justify-center rounded-md border border-line bg-[#f7faf8] px-2 text-center text-[11px] text-muted">
            {listen ? "Provision dahulu" : "Belum tersedia"}
          </span>
        )}
        <span className="sr-only">
          Publikasi lokasi:{" "}
          {device.locationDisclosureApproved
            ? "Disetujui"
            : "Tidak ditampilkan"}
        </span>
      </div>
    </article>
  );
}

export function DeviceFleetPanel() {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/admin/device-fleet", {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      const data = (await response.json()) as Inventory & { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? `HTTP ${response.status}`);
      if (signal?.aborted) return;
      setInventory(data);
      setError("");
    } catch (reason) {
      if (signal?.aborted) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "Daftar perangkat tidak tersedia.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const all = inventory?.devices ?? [];
  const stats = {
    total: all.filter((d) => d.deviceId !== null).length,
    listen: all.filter(
      (d) => d.kind === "listen_device" && d.deviceStatus === "active",
    ).length,
    prevent: all.filter(
      (d) => d.kind === "prevent_device" && d.deviceStatus === "active",
    ).length,
    recordings: all.reduce((sum, d) => sum + (d.recordingCount ?? 0), 0),
  };
  const filtered = all.filter(
    (d) =>
      (category === "all" || d.kind === category) &&
      `${d.label} ${d.code} ${d.locationLabel ?? ""}`
        .toLocaleLowerCase("id-ID")
        .includes(search.trim().toLocaleLowerCase("id-ID")),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(
    (Math.min(page, pages) - 1) * PAGE_SIZE,
    Math.min(page, pages) * PAGE_SIZE,
  );
  function selectCategory(next: Category) {
    setCategory(next);
    setPage(1);
  }

  async function createSource(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!inventory || creating) return;
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/device-sources", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: inventory.organizationId,
          code: code.trim().toLowerCase(),
          label: label.trim(),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? `HTTP ${response.status}`);
      setCode("");
      setLabel("");
      setCreateOpen(false);
      selectCategory("listen_device");
      setMessage(
        "Sumber LISTEN baru tersimpan. Lanjutkan provisioning untuk memperoleh token perangkat baru; perangkat yang sudah ada tidak berubah.",
      );
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Gagal membuat sumber LISTEN.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <section aria-label="Inventaris perangkat IoT" className="space-y-5">
      <div className="grid gap-x-4 gap-y-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <h1 className="text-[26px] font-semibold tracking-tight text-[#142e25] sm:text-[30px]">
          Perangkat IoT
        </h1>
        <div className="flex flex-wrap gap-2 xl:col-start-2 xl:row-start-1">
          <Link
            href="/admin/devices/new"
            className="inline-flex min-h-10 items-center rounded-md border border-line-strong bg-white px-4 text-xs font-semibold text-[#243a30] hover:bg-bg sm:text-sm"
          >
            Buka wizard provisioning
          </Link>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              void refresh();
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong bg-white px-3 text-xs font-semibold text-[#243a30] hover:bg-bg disabled:opacity-60 sm:text-sm"
          >
            <MiniIcon name="refresh" className="size-4" />
            Muat ulang
          </button>
          <button
            type="button"
            aria-expanded={createOpen}
            onClick={() => setCreateOpen((v) => !v)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[#147a5b] px-4 text-xs font-semibold text-white hover:bg-[#0f6349] sm:text-sm"
          >
            <MiniIcon name="plus" className="size-4" />
            Tambah perangkat
          </button>
        </div>
        <p className="text-sm leading-6 text-[#718077] xl:col-span-2">
          Daftar perangkat dari database organisasi. Setiap alat mempunyai
          identitas dan lokasi pemasangan sendiri.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Total perangkat"
          value={inventory ? stats.total : "—"}
          icon="device"
          iconClass="bg-[#f0f3f3] text-[#3f6255]"
        />
        <Metric
          label="LISTEN aktif"
          value={inventory ? stats.listen : "—"}
          icon="listen"
        />
        <Metric
          label="PREVENT aktif"
          value={inventory ? stats.prevent : "—"}
          icon="prevent"
          iconClass="bg-[#eaf5f8] text-[#1c7c89]"
        />
        <Metric
          label="Rekaman perangkat"
          value={inventory ? stats.recordings.toLocaleString("id-ID") : "—"}
          icon="record"
          iconClass="bg-[#f2f5f3] text-[#3b6756]"
        />
      </div>

      {createOpen && (
        <section
          className="rounded-xl border border-[#badbc9] bg-white p-5 shadow-sm"
          aria-label="Tambah perangkat IoT"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Tambah perangkat baru</h2>
              <p className="mt-1 text-xs text-muted">
                Pilih jenis perangkat. Membuat sumber tidak langsung
                mengaktifkan perangkat fisik.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:bg-bg"
            >
              Tutup
            </button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <form
              onSubmit={(e) => void createSource(e)}
              className="rounded-xl border border-line bg-[#fbfdfb] p-4"
            >
              <div className="mb-3 flex items-center gap-3">
                <DeviceIllustration kind="listen_device" />
                <div>
                  <h3 className="font-semibold">LISTEN</h3>
                  <p className="text-xs text-muted">
                    ESP32 · sensor bioakustik
                  </p>
                </div>
              </div>
              <label className="block text-xs font-medium">
                Kode sumber
                <input
                  required
                  minLength={3}
                  maxLength={63}
                  pattern="[a-z][a-z0-9_-]{2,62}"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="listen-esp32-02"
                  className="mt-1 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="mt-3 block text-xs font-medium">
                Nama tampilan
                <input
                  required
                  minLength={3}
                  maxLength={100}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Auvrion LISTEN ESP32 02"
                  className="mt-1 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm"
                />
              </label>
              <button
                type="submit"
                disabled={creating || !inventory}
                className="mt-4 rounded-md bg-[#147a5b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? "Menyimpan..." : "Buat sumber LISTEN"}
              </button>
            </form>
            <div className="rounded-xl border border-line bg-[#fbfdfb] p-4">
              <div className="flex items-center gap-3">
                <DeviceIllustration kind="prevent_device" />
                <div>
                  <h3 className="font-semibold">PREVENT</h3>
                  <p className="text-xs text-muted">Sensor risiko lingkungan</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">
                Backend provisioning dan telemetri PREVENT belum diaktifkan.
                Kategori ini tetap tersedia sebagai rancangan tanpa membuat
                perangkat atau status aktif fiktif.
              </p>
              <span className="mt-4 inline-block rounded-md bg-[#eef1f2] px-3 py-2 text-xs font-semibold text-[#697d80]">
                Pendaftaran belum tersedia
              </span>
            </div>
          </div>
        </section>
      )}

      <div className="rounded-xl border border-line bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div
            role="tablist"
            aria-label="Filter jenis perangkat"
            className="flex flex-wrap gap-1.5"
          >
            {(
              [
                { value: "all", text: "Semua" },
                { value: "listen_device", text: "LISTEN" },
                { value: "prevent_device", text: "PREVENT" },
              ] as const
            ).map((tab) => {
              const count = all.filter(
                (d) => tab.value === "all" || d.kind === tab.value,
              ).length;
              return (
                <button
                  key={tab.value}
                  role="tab"
                  type="button"
                  aria-selected={category === tab.value}
                  onClick={() => selectCategory(tab.value)}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${category === tab.value ? "bg-[#eaf5ee] text-[#177254]" : "text-[#6b7d72] hover:bg-bg"}`}
                >
                  {tab.text} ({inventory ? count : "—"})
                </button>
              );
            })}
          </div>
          <label className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-md border border-[#e1e8e2] bg-white px-3 text-[#819188] transition-colors focus-within:border-[#b5d5c3] focus-within:shadow-[0_0_0_2px_rgba(20,122,91,0.08)] sm:max-w-sm">
            <MiniIcon name="search" className="size-[18px]" />
            <span className="sr-only">
              Cari nama, kode atau lokasi perangkat
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Cari nama perangkat, kode, atau lokasi..."
              className="min-w-0 w-full appearance-none border-0 bg-transparent py-2 text-sm text-ink outline-none ring-0 placeholder:text-[#9aa89e] focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              style={{ outline: "none", boxShadow: "none", border: 0 }}
            />
          </label>
        </div>
        {error && (
          <p
            role="alert"
            className="my-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            Gagal memuat data: {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="my-3 rounded-md border border-[#badbc9] bg-[#ecf7ee] p-3 text-sm text-[#176c4c]"
          >
            {message}
          </p>
        )}
        {loading && (
          <p
            role="status"
            className="px-3 py-10 text-center text-sm text-muted"
          >
            Memuat perangkat dari database...
          </p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <DeviceIllustration
              kind={
                category === "prevent_device"
                  ? "prevent_device"
                  : "listen_device"
              }
              large
            />
            <h2 className="text-base font-semibold">
              {search
                ? "Perangkat tidak ditemukan"
                : category === "prevent_device"
                  ? "Belum ada sumber PREVENT"
                  : "Belum ada perangkat dalam kategori ini"}
            </h2>
            <p className="max-w-md text-sm leading-6 text-muted">
              {search
                ? "Coba kata kunci lain atau pilih tab Semua."
                : category === "prevent_device"
                  ? "Layanan PREVENT belum mendukung provisioning dan belum memiliki perangkat terdaftar dalam organisasi ini."
                  : "Gunakan tombol Tambah perangkat untuk membuat sumber LISTEN baru."}
            </p>
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="mt-3 space-y-3">
            {visible.map((device) => (
              <Row key={device.sourceId} device={device} />
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted">
          <span>
            Menampilkan{" "}
            {filtered.length === 0
              ? 0
              : (Math.min(page, pages) - 1) * PAGE_SIZE + 1}
            –{Math.min(Math.min(page, pages) * PAGE_SIZE, filtered.length)} dari{" "}
            {filtered.length} sumber/perangkat
          </span>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((v) => Math.max(1, v - 1))}
                className="rounded-md border border-line px-3 py-2 disabled:opacity-40"
              >
                Sebelumnya
              </button>
              <span>
                {page} / {pages}
              </span>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((v) => Math.min(pages, v + 1))}
                className="rounded-md border border-line px-3 py-2 disabled:opacity-40"
              >
                Berikutnya
              </button>
            </div>
          )}
        </div>
      </div>
      {category === "prevent_device" && (
        <p className="text-xs text-muted">
          Catatan: PREVENT adalah kategori yang disiapkan untuk iterasi
          berikutnya. Jumlah perangkat aktif hanya dihitung dari registrasi
          database yang benar-benar ada.
        </p>
      )}
    </section>
  );
}
