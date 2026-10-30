"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OperatorLayout } from "@/figma-operator/components/operator/OperatorLayout";
import { useOperator } from "@/figma-operator/operator-context";

type Device = {
  id: string;
  code: string;
  label: string;
  registrationStatus: "active" | "revoked" | "source_inactive";
  recordingCount: number;
  lastReceivedAt: string | null;
};
type Fleet = { devices: Device[]; truncated: boolean };

const ILLUSTRATIONS = {
  listen: "/device-illustrations/listen-device.png",
  prevent: "/device-illustrations/prevent-device.png",
} as const;

function IsometricDevice({ kind }: { kind: "listen" | "prevent" }) {
  return (
    <div className="flex h-56 items-center justify-center overflow-hidden rounded-xl bg-[#f7faf8] p-3">
      <Image
        src={ILLUSTRATIONS[kind]}
        width={340}
        height={220}
        alt={`Ilustrasi konsep perangkat Auvrion ${kind === "listen" ? "LISTEN" : "PREVENT"}`}
        className="h-full w-full object-contain"
      />
    </div>
  );
}

export function IotHubWorkspace() {
  const { operator, timeZone } = useOperator();
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          organizationId: operator.organizationId,
        });
        const response = await fetch(`/api/operator/listen?${params}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal,
        });
        if (!response.ok) throw new Error("FETCH_FAILED");
        const json: unknown = await response.json();
        if (
          !json ||
          typeof json !== "object" ||
          !("devices" in json) ||
          !Array.isArray(json.devices)
        )
          throw new Error("INVALID_FLEET");
        if (!signal?.aborted) {
          setFleet(json as Fleet);
          setError("");
        }
      } catch {
        if (!signal?.aborted) {
          setFleet(null);
          setError("Data perangkat belum dapat dimuat.");
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [operator.organizationId],
  );
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const devices = fleet?.devices ?? [];
  const total = devices.reduce((sum, device) => sum + device.recordingCount, 0);
  const received = devices.reduce<string | null>(
    (latest, device) =>
      device.lastReceivedAt && (!latest || device.lastReceivedAt > latest)
        ? device.lastReceivedAt
        : latest,
    null,
  );
  const zone =
    timeZone === "WIB"
      ? "Asia/Jakarta"
      : timeZone === "WIT"
        ? "Asia/Jayapura"
        : "Asia/Makassar";
  const receivedLabel = received
    ? `${new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: zone,
      }).format(new Date(received))} ${timeZone}`
    : "Belum ada";

  return (
    <OperatorLayout path="/operator/iot" crumbs={[{ label: "Alat IoT" }]}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Alat IoT</h1>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
          className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
        >
          {loading ? "Memuat..." : "Segarkan data"}
        </button>
      </header>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-line bg-white px-4 py-3 text-sm text-warn"
        >
          {error}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-sm">
          <IsometricDevice kind="listen" />
          <div className="space-y-4 p-1 pt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-ink">LISTEN</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                Bioakustik
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric
                label="Perangkat"
                value={fleet ? String(devices.length) : "—"}
              />
              <Metric
                label="WAV diterima"
                value={fleet ? String(total) : "—"}
              />
              <Metric
                label="Terakhir"
                value={fleet ? receivedLabel : "—"}
                small
              />
            </div>
            <Link
              href="/operator/listen"
              className="block rounded-lg bg-emerald-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Lihat perangkat LISTEN
            </Link>
            {fleet?.truncated && (
              <p className="text-xs text-muted">
                Daftar hanya menampilkan 50 perangkat pertama.
              </p>
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <IsometricDevice kind="prevent" />
          <div className="space-y-4 p-1 pt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-ink">PREVENT</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Belum diimplementasikan
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Perangkat" value="—" />
              <Metric label="Pembacaan" value="—" />
              <Metric label="Terakhir" value="—" />
            </div>
            <Link
              href="/operator/iot/prevent"
              className="block rounded-lg border border-emerald-700/30 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              Lihat PREVENT
            </Link>
          </div>
        </section>
      </div>
      <section className="mt-6 rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-4 text-base font-bold text-ink">
          Perangkat LISTEN terdaftar
        </h2>
        {loading && !fleet ? (
          <p className="text-sm text-muted">Memuat data...</p>
        ) : fleet && !devices.length ? (
          <p className="text-sm text-muted">Belum ada perangkat terdaftar.</p>
        ) : fleet ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {devices.slice(0, 6).map((device) => (
              <Link
                key={device.id}
                href={`/operator/listen/${encodeURIComponent(device.id)}`}
                className="rounded-xl border border-line bg-[#f6faf8] p-4 hover:border-emerald-500 hover:bg-emerald-50"
              >
                <p className="font-semibold text-ink">{device.code}</p>
                <p className="mt-1 truncate text-xs text-muted">
                  {device.label}
                </p>
                <p className="mt-3 text-xs font-semibold text-emerald-800">
                  {device.recordingCount} WAV diterima
                </p>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </OperatorLayout>
  );
}

function Metric({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-[#f1f7f4] p-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-1 break-words font-bold text-ink ${small ? "text-xs leading-5" : "text-xl"}`}
      >
        {value}
      </p>
    </div>
  );
}
