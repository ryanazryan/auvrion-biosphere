"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { SelectMenu } from "@/components/ui/SelectMenu";
import {
  type DeviceStatusFilter,
  filterDeviceRows,
  provisionableSources,
} from "./device-management-policy";
import {
  type DeviceKind,
  DeviceProvisioningView,
} from "./device-provisioning-view";

type Source = {
  id: string;
  code: string;
  label: string;
  kind: string;
  isActive: boolean;
};
type Device = {
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
type OneTimeCredential = {
  deviceId: string;
  credential: string;
  version: number;
  action: "provision" | "rotate";
};
type Action = "rotate" | "revoke";
type Filter = DeviceStatusFilter;

type Props = {
  organizationId: string;
  organizationName: string;
  sources: Source[];
  devices: Device[];
};

function Icon({
  name,
  size = 18,
}: {
  name:
    | "cpu"
    | "plus"
    | "search"
    | "x"
    | "copy"
    | "check"
    | "shield"
    | "arrow"
    | "rotate"
    | "power"
    | "refresh"
    | "mic"
    | "harddrive"
    | "wifi"
    | "clock"
    | "eye"
    | "eyeoff"
    | "info";
  size?: number;
}) {
  const shapes = {
    cpu: (
      <>
        <rect x="5" y="5" width="14" height="14" rx="2" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
        <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.4" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    x: <path d="M6 6 18 18M18 6 6 18" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    check: <path d="m5 12 5 5L20 7" />,
    shield: (
      <>
        <path d="M12 2 20 6v6c0 5-3.3 8.4-8 10-4.7-1.6-8-5-8-10V6l8-4Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    rotate: (
      <>
        <path d="M20 11a8 8 0 1 0-2.5 6" />
        <path d="M20 4v7h-7" />
      </>
    ),
    power: (
      <>
        <path d="M12 2v10M6.4 5.8a9 9 0 1 0 11.2 0" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v6h-6" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="2" width="6" height="13" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
      </>
    ),
    harddrive: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 15h16M7 18h1M12 18h5" />
      </>
    ),
    wifi: (
      <>
        <path d="M2 8a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8 16a5 5 0 0 1 8 0" />
        <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    eyeoff: (
      <>
        <path d="m3 3 18 18M10 5.3a12 12 0 0 1 2-.3c6 0 10 7 10 7a17 17 0 0 1-3 3.7M6.3 6.3C3.4 8.5 2 12 2 12s4 7 10 7a10.5 10.5 0 0 0 4-.8" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v6M12 7h.01" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
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

const primary =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#17785e] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#125f4b] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#20785f]";
const secondary =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#d4e0d8] bg-white px-4 text-[13px] font-medium text-[#285542] hover:bg-[#f2f7f3] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#20785f]";
const danger =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#a83c3c] px-4 text-[13px] font-semibold text-white hover:bg-[#8b302f] disabled:opacity-50";

function Dialog({
  title,
  onClose,
  children,
  closeAllowed = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeAllowed?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeAllowed) onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose, closeAllowed]);
  return (
    <div
      className="fixed inset-0 z-80 grid place-items-center overflow-y-auto bg-[#0b231b]/55 p-3 sm:p-5"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Tutup dialog"
        disabled={!closeAllowed}
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative my-auto w-full max-w-xl overflow-hidden rounded-2xl border border-[#dce6df] bg-white shadow-[0_20px_80px_rgba(10,32,23,0.2)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e5ebe6] px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-[#142d25]">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Tutup dialog"
            disabled={!closeAllowed}
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-[#66796d] hover:bg-[#f1f5f2] disabled:opacity-30"
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="max-h-[min(75vh,660px)] overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>
      </section>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Belum ada";
  try {
    return `${new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Makassar",
      hour12: false,
    }).format(new Date(value))} WITA`;
  } catch {
    return "—";
  }
}

function DeviceState({ device }: { device: Device }) {
  const inactive = device.status === "revoked" || !device.sourceActive;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${inactive ? "text-[#8b5961]" : "text-[#167658]"}`}
    >
      <span
        className={`size-2 rounded-full ${inactive ? "bg-[#b37a80]" : "bg-[#218264]"}`}
      />
      {device.status === "revoked"
        ? "Dicabut"
        : !device.sourceActive
          ? "Sumber nonaktif"
          : "Aktif"}
    </span>
  );
}

export function DeviceManagementWorkspace({
  organizationId,
  organizationName,
  sources,
  devices,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [kind, setKind] = useState<DeviceKind>("listen");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);
  const [token, setToken] = useState<OneTimeCredential | null>(null);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestLock = useRef(false);
  const selected = devices.find((row) => row.id === selectedId) ?? null;
  const availableSources = provisionableSources(sources, devices);
  const registerRequested = params.get("register") === "1";
  const filtered = useMemo(
    () => filterDeviceRows(devices, query, filter),
    [devices, query, filter],
  );
  useEffect(() => {
    if (registerRequested) setProvisionOpen(true);
  }, [registerRequested]);

  function clearUrl() {
    if (registerRequested) router.replace("/admin/devices", { scroll: false });
  }
  function closeProvision() {
    setProvisionOpen(false);
    setError("");
    clearUrl();
  }
  function dismissToken() {
    if (!saved) return;
    setToken(null);
    setTokenVisible(false);
    setSaved(false);
    setError("");
    clearUrl();
    router.refresh();
  }
  async function copy(value: string, item: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${item} disalin.`);
    } catch {
      setError(`Gagal menyalin ${item.toLowerCase()}.`);
    }
  }
  async function post(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const reason =
        result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : "DEVICE_OPERATION_UNAVAILABLE";
      throw new Error(
        response.status === 409
          ? "Sumber ini sudah terdaftar atau data perangkat berubah."
          : response.status === 401 || response.status === 403
            ? "Akses ditolak. Periksa izin Admin dan verifikasi MFA."
            : response.status === 422
              ? "Sumber LISTEN tidak aktif atau tidak tersedia."
              : `Operasi gagal (${response.status}): ${reason}`,
      );
    }
    return result;
  }
  function credentialOf(
    result: unknown,
    action: "provision" | "rotate",
  ): OneTimeCredential {
    if (
      !result ||
      typeof result !== "object" ||
      !("deviceId" in result) ||
      !("credential" in result) ||
      !("version" in result) ||
      typeof result.deviceId !== "string" ||
      typeof result.credential !== "string" ||
      !result.credential.startsWith("abdev_v1_") ||
      typeof result.version !== "number"
    ) {
      throw new Error(
        "Respons kredensial tidak valid. Periksa status perangkat sebelum mencoba lagi.",
      );
    }
    return {
      deviceId: result.deviceId,
      credential: result.credential,
      version: result.version,
      action,
    };
  }
  async function provision() {
    if (
      requestLock.current ||
      !sourceId ||
      !availableSources.some((x) => x.id === sourceId)
    )
      return;
    requestLock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await post("/api/admin/devices", {
        organizationId,
        sourceId,
      });
      const issued = credentialOf(result, "provision");
      setProvisionOpen(false);
      setToken(issued);
      setSaved(false);
      setTokenVisible(false);
      // Refresh only after the one-time token has been saved and dismissed.
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Pendaftaran belum dikonfirmasi.",
      );
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }
  async function manage() {
    if (
      !selected ||
      !confirmAction ||
      requestLock.current ||
      selected.status === "revoked"
    )
      return;
    requestLock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await post(
        `/api/admin/devices/${encodeURIComponent(selected.id)}`,
        { organizationId, action: confirmAction },
      );
      if (confirmAction === "rotate") {
        const issued = credentialOf(result, "rotate");
        setToken(issued);
        setSaved(false);
        setTokenVisible(false);
      } else {
        if (
          !result ||
          typeof result !== "object" ||
          !("status" in result) ||
          result.status !== "revoked"
        )
          throw new Error(
            "Respons pencabutan tidak valid. Periksa kembali status perangkat.",
          );
        setNotice("Akses perangkat telah dicabut.");
      }
      setConfirmAction(null);
      if (confirmAction === "revoke") router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Perubahan belum dikonfirmasi.",
      );
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {notice && (
        <div
          role="status"
          className="flex items-center justify-between rounded-lg border border-[#cce5d9] bg-[#f0f8f4] px-4 py-2.5 text-sm text-[#206b4f]"
        >
          {notice}
          <button
            type="button"
            aria-label="Tutup notifikasi"
            onClick={() => setNotice("")}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
      <DeviceProvisioningView
        organizationName={organizationName}
        sources={sources}
        devices={devices}
        filtered={filtered}
        availableSources={availableSources}
        kind={kind}
        onKindChange={setKind}
        sourceId={sourceId}
        onSourceChange={setSourceId}
        onProvision={() => {
          setError("");
          if (!availableSources.some((source) => source.id === sourceId)) {
            setSourceId(availableSources[0]?.id ?? "");
          }
          setProvisionOpen(true);
        }}
        onDetail={(deviceId) => {
          setSelectedId(deviceId);
          setError("");
        }}
        onCopy={(value, item) => {
          void copy(value, item);
        }}
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        onRefresh={() => router.refresh()}
      />

      {provisionOpen && (
        <Dialog
          title="Daftarkan Perangkat LISTEN"
          closeAllowed={!busy}
          onClose={closeProvision}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-[#f2f7f3] p-3">
              <span className="grid size-10 place-items-center rounded-lg bg-[#e1eee7] text-[#167456]">
                <Icon name="cpu" />
              </span>
              <div>
                <p className="text-[13px] font-semibold">Identitas perangkat</p>
                <p className="text-xs text-[#718177]">
                  Pendaftaran menggunakan sumber LISTEN yang sudah aktif.
                </p>
              </div>
            </div>
            <div>
              <p className="mb-1.5 block text-xs font-medium">Organisasi</p>
              <p className="rounded-lg border border-[#d8e4db] bg-[#f8faf8] px-3 py-3 text-[13px]">
                {organizationName}
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium">Sumber observasi</p>
              <SelectMenu
                label="Pilih sumber observasi LISTEN"
                value={sourceId}
                onChange={setSourceId}
                options={availableSources.map((s) => ({
                  value: s.id,
                  label: s.label,
                  description: s.code,
                }))}
              />
              {availableSources.length === 0 && (
                <p className="mt-2 text-xs text-[#a06f36]">
                  Tidak ada sumber LISTEN aktif yang belum digunakan. Sumber
                  yang sudah terdaftar tidak dapat didaftarkan ulang.
                </p>
              )}
            </div>
            {sourceId && (
              <div className="rounded-lg border border-[#e4eae5] p-3 text-xs">
                <p className="text-[#7c897f]">Jenis perangkat</p>
                <p className="mt-1 font-semibold">LISTEN · ESP32 / INMP441</p>
                <p className="mt-2 break-all text-[#728277]">
                  Source ID: {sourceId}
                </p>
              </div>
            )}
            <p className="text-xs leading-5 text-[#748378]">
              Backend akan membuat Device ID dan token secara otomatis. Token
              hanya ditampilkan satu kali setelah berhasil.
            </p>
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-[#f2d7d5] bg-[#fff8f7] p-3 text-xs text-[#a43c3c]"
              >
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-[#e8eee9] pt-4">
              <button
                className={secondary}
                type="button"
                onClick={closeProvision}
                disabled={busy}
              >
                Batal
              </button>
              <button
                className={primary}
                type="button"
                disabled={
                  busy || !availableSources.some((x) => x.id === sourceId)
                }
                onClick={provision}
              >
                {busy ? "Mendaftarkan..." : "Daftarkan perangkat"}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {selected && !token && (
        <Dialog
          title="Detail perangkat"
          closeAllowed={!busy}
          onClose={() => {
            setSelectedId(null);
            setError("");
            setConfirmAction(null);
          }}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">{selected.sourceLabel}</h3>
                <p className="mt-1 text-xs text-[#728277]">
                  {selected.sourceCode}
                </p>
              </div>
              <DeviceState device={selected} />
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-lg border border-[#e4ebe5] p-4 text-xs">
              <div>
                <dt className="text-[#7b897e]">Device ID</dt>
                <dd className="mt-1 break-all font-medium">{selected.id}</dd>
              </div>
              <div>
                <dt className="text-[#7b897e]">Token versi</dt>
                <dd className="mt-1 font-medium">
                  {selected.credentialVersion}
                </dd>
              </div>
              <div>
                <dt className="text-[#7b897e]">Rekaman diterima</dt>
                <dd className="mt-1 font-medium">{selected.recordingCount}</dd>
              </div>
              <div>
                <dt className="text-[#7b897e]">Konektivitas</dt>
                <dd className="mt-1 font-medium">Tidak diketahui</dd>
              </div>
              <div>
                <dt className="text-[#7b897e]">Didaftarkan</dt>
                <dd className="mt-1 font-medium">
                  {formatDate(selected.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-[#7b897e]">Terakhir diterima</dt>
                <dd className="mt-1 font-medium">
                  {formatDate(selected.lastReceivedAt)}
                </dd>
              </div>
            </dl>
            <button
              className={`${secondary} w-full`}
              type="button"
              onClick={() => void copy(selected.id, "Device ID")}
            >
              <Icon name="copy" size={15} /> Salin Device ID
            </button>
            {selected.status === "active" && !confirmAction && (
              <div className="flex flex-wrap gap-2 border-t border-[#e8eee9] pt-4">
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    setError("");
                    setConfirmAction("rotate");
                  }}
                >
                  <Icon name="rotate" size={15} /> Rotasi token
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#e9b9b9] px-4 text-[13px] font-semibold text-[#a83c3c] hover:bg-[#fff5f5]"
                  onClick={() => {
                    setError("");
                    setConfirmAction("revoke");
                  }}
                >
                  <Icon name="power" size={15} /> Cabut akses
                </button>
              </div>
            )}
            {confirmAction && (
              <div className="rounded-lg border border-[#e2e7e2] bg-[#fbfcfb] p-4">
                <p className="text-sm font-semibold">
                  {confirmAction === "rotate"
                    ? "Rotasi token perangkat?"
                    : "Cabut akses perangkat?"}
                </p>
                <p className="mt-2 text-xs leading-5 text-[#657469]">
                  {confirmAction === "rotate"
                    ? "Token sebelumnya tidak berlaku setelah rotasi. Konfigurasi ESP32 perlu diperbarui."
                    : "Perangkat tidak dapat mengirim rekaman baru setelah akses dicabut. Rekaman lama tetap tersimpan."}
                </p>
                {error && (
                  <p role="alert" className="mt-2 text-xs text-[#a83c3c]">
                    {error}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={secondary}
                    disabled={busy}
                    onClick={() => {
                      setConfirmAction(null);
                      setError("");
                    }}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    className={confirmAction === "revoke" ? danger : primary}
                    disabled={busy}
                    onClick={manage}
                  >
                    {busy
                      ? "Memproses..."
                      : confirmAction === "rotate"
                        ? "Rotasi token"
                        : "Cabut akses"}
                  </button>
                </div>
              </div>
            )}
            {!confirmAction && error && (
              <p role="alert" className="text-xs text-[#a83c3c]">
                {error}
              </p>
            )}
          </div>
        </Dialog>
      )}

      {token && (
        <Dialog
          title={
            token.action === "provision"
              ? "Perangkat berhasil didaftarkan"
              : "Token perangkat diperbarui"
          }
          closeAllowed={saved}
          onClose={dismissToken}
        >
          <div className="space-y-4">
            <div className="flex gap-3 rounded-lg border border-[#cae4d5] bg-[#eff8f1] p-3 text-[#196747]">
              <Icon name="shield" size={22} />
              <p className="text-[13px] leading-5">
                Kredensial berhasil diterbitkan oleh backend. Simpan token
                sekarang; token ini tidak dapat ditampilkan kembali.
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium">Device ID</p>
              <div className="flex items-center gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-[#dae5dc] bg-[#fafcfb] px-3 py-2.5 font-mono text-[12px]"
                  readOnly
                  value={token.deviceId}
                />
                <button
                  className={`${secondary} px-3`}
                  type="button"
                  aria-label="Salin Device ID"
                  onClick={() => void copy(token.deviceId, "Device ID")}
                >
                  <Icon name="copy" size={16} />
                </button>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium">
                Token autentikasi · versi {token.version}
              </p>
              <div className="flex items-center gap-2">
                <input
                  aria-label="Token autentikasi perangkat"
                  className="min-w-0 flex-1 rounded-lg border border-[#dae5dc] bg-[#fafcfb] px-3 py-2.5 font-mono text-[12px]"
                  readOnly
                  type={tokenVisible ? "text" : "password"}
                  value={token.credential}
                />
                <button
                  className={`${secondary} px-3`}
                  type="button"
                  onClick={() => setTokenVisible((old) => !old)}
                  aria-label={
                    tokenVisible ? "Sembunyikan token" : "Tampilkan token"
                  }
                >
                  <Icon name={tokenVisible ? "eyeoff" : "eye"} size={16} />
                </button>
                <button
                  className={`${secondary} px-3`}
                  type="button"
                  onClick={() => void copy(token.credential, "Token")}
                  aria-label="Salin token"
                >
                  <Icon name="copy" size={16} />
                </button>
              </div>
            </div>
            <p className="text-xs leading-5 text-[#718076]">
              Simpan token di konfigurasi lokal yang diabaikan Git. Jangan
              letakkan token di screenshot, issue, atau repository.
            </p>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e0e8e1] p-3 text-[13px]">
              <input
                className="mt-0.5 size-4 accent-[#20785f]"
                type="checkbox"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
              />
              <span>Saya sudah menyimpan token perangkat dengan aman.</span>
            </label>
            {error && (
              <p role="alert" className="text-xs text-[#a83c3c]">
                {error}
              </p>
            )}
            <button
              type="button"
              className={`${primary} w-full`}
              disabled={!saved}
              onClick={dismissToken}
            >
              <Icon name="check" size={16} /> Selesai
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
