"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useOperator } from "../operator-context";

type Device = {
  id: string;
  code: string;
  label: string;
  registrationStatus: "active" | "revoked" | "source_inactive";
  connectivity: "unknown";
  recordingCount: number;
  lastReceivedAt: string | null;
  latestObservationId: string | null;
  lastIngestionMode: "live" | "historical" | "simulation" | null;
  lastClockQuality: "rtc_verified" | "unverified" | null;
};
type Snapshot = {
  devices: Device[];
  truncated: boolean;
  checkedAt: string;
  connectivityAvailable: false;
};

function formatDate(value: string | null, timezone: string) {
  if (!value) return "Belum ada rekaman";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Waktu tidak tersedia";
  const zone =
    timezone === "WIB"
      ? "Asia/Jakarta"
      : timezone === "WIT"
        ? "Asia/Jayapura"
        : "Asia/Makassar";
  return `${date.toLocaleString("id-ID", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  })} ${timezone}`;
}

function statusLabel(status: Device["registrationStatus"]) {
  if (status === "revoked") return "Kredensial dicabut";
  if (status === "source_inactive") return "Sumber nonaktif";
  return "Terdaftar · status koneksi tidak diketahui";
}

/** Real WC-017 registrations & receipts; no fabricated heartbeat, AI job, or device events. */
export function ListenMonitor() {
  const { operator, timeZone } = useOperator();
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  useEffect(() => {
    void refreshKey;
    let live = true;
    let active: AbortController | null = null;
    let pending = false;
    const load = async () => {
      if (
        !live ||
        pending ||
        (typeof document !== "undefined" && document.hidden)
      )
        return;
      pending = true;
      const controller = new AbortController();
      active = controller;
      try {
        const url = `/api/operator/listen?organizationId=${encodeURIComponent(operator.organizationId)}`;
        const response = await fetch(url, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const value: unknown = await response.json();
        if (
          !value ||
          typeof value !== "object" ||
          !("devices" in value) ||
          !Array.isArray(value.devices)
        ) {
          throw new Error("Invalid API response");
        }
        if (live) {
          setData(value as Snapshot);
          setError("");
        }
      } catch {
        if (live && !controller.signal.aborted)
          setError("Data pemantauan LISTEN belum dapat diambil.");
      } finally {
        pending = false;
        if (live) setLoading(false);
      }
    };
    void load();
    const interval = setInterval(() => void load(), 10000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      active?.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [operator.organizationId, refreshKey]);

  const devices =
    data?.devices.filter((device) =>
      `${device.code} ${device.label}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    ) ?? [];

  return (
    <section
      className="overflow-hidden rounded-lg border border-line bg-surface"
      aria-labelledby="listen-heading"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2
            id="listen-heading"
            className="text-[15px] font-semibold text-ink"
          >
            Pemantauan LISTEN
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-line px-2 py-1 text-xs text-muted">
            Data server · 10 detik
          </span>
          <Link
            href="/operator/listen"
            className="rounded border border-line px-3 py-1.5 text-xs font-medium text-brand hover:bg-bg"
          >
            Jaringan & rekaman
          </Link>
          <button
            type="button"
            onClick={refresh}
            className="rounded border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg"
          >
            Segarkan
          </button>
        </div>
      </header>
      {error && (
        <p
          className="border-b border-line bg-bg px-4 py-2 text-xs text-warn"
          role="alert"
        >
          {error} Informasi sebelumnya mungkin sudah kedaluwarsa.
        </p>
      )}
      {loading && !data ? (
        <div className="px-4 py-7 text-sm text-muted" role="status">
          Memuat perangkat LISTEN...
        </div>
      ) : data ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex flex-wrap gap-4 text-xs text-muted">
              <span>
                <strong className="text-lg text-ink">
                  {data.devices.length}
                </strong>{" "}
                perangkat terdaftar
              </span>
              <span>
                <strong className="text-lg text-ink">
                  {
                    data.devices.filter(
                      (d) => d.registrationStatus === "active",
                    ).length
                  }
                </strong>{" "}
                registrasi aktif
              </span>
              <span>
                <strong className="text-lg text-ink">
                  {data.devices.reduce((sum, d) => sum + d.recordingCount, 0)}
                </strong>{" "}
                rekaman diterima
              </span>
            </div>
            <label className="flex min-w-0 items-center gap-2 text-xs text-muted">
              Cari perangkat
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="LISTEN-01..."
                className="min-w-0 rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink"
              />
            </label>
          </div>
          {data.devices.length === 0 ? (
            <div className="space-y-2 px-4 py-8">
              <p className="font-medium text-ink">
                Belum ada perangkat LISTEN terdaftar
              </p>
              <p className="text-sm text-muted">
                Saat ESP32 siap, Admin dapat menyiapkan satu identitas dan
                sumber LISTEN untuk setiap perangkat. Tidak ada perangkat demo
                yang diklaim online.
              </p>
            </div>
          ) : devices.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              Tidak ada perangkat yang cocok dengan pencarian.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {devices.map((device) => (
                <li
                  key={device.id}
                  className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-ink">
                      {device.code}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {device.label}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {statusLabel(device.registrationStatus)}
                    </p>
                  </div>
                  <div className="min-w-0 text-xs text-muted">
                    <p>
                      Rekaman diterima:{" "}
                      <strong className="text-ink">
                        {device.recordingCount}
                      </strong>
                    </p>
                    <p className="mt-1">
                      Terakhir masuk:{" "}
                      {formatDate(device.lastReceivedAt, timeZone)}
                    </p>
                    {device.lastIngestionMode && (
                      <p className="mt-1">
                        Jenis data terakhir:{" "}
                        {device.lastIngestionMode === "simulation"
                          ? "Simulasi"
                          : device.lastIngestionMode === "historical"
                            ? "Historis"
                            : "Dikirim sebagai live"}
                      </p>
                    )}
                    {device.lastClockQuality === "unverified" && (
                      <p className="mt-1">Jam perangkat belum terverifikasi</p>
                    )}
                  </div>
                  {device.latestObservationId ? (
                    <Link
                      href={`/operator/observations/${device.latestObservationId}`}
                      className="w-fit rounded border border-line px-3 py-2 text-xs font-medium text-brand hover:bg-bg"
                    >
                      Lihat observasi
                    </Link>
                  ) : (
                    <span className="text-xs text-muted">
                      Belum ada observasi perangkat
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {data.truncated && (
            <p className="border-t border-line px-4 py-2 text-xs text-muted">
              Hanya 50 perangkat pertama ditampilkan. Gunakan halaman
              administrasi untuk inventaris lengkap.
            </p>
          )}
        </>
      ) : (
        <div className="px-4 py-7 text-sm text-muted">
          Status perangkat belum tersedia. Periksa layanan database dan akses
          organisasi.
        </div>
      )}
    </section>
  );
}
