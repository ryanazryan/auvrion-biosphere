"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useOperator } from "@/figma-operator/operator-context";

type Location = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  zoneName?: string | null;
};

export function ListenInstallationCard({ deviceId }: { deviceId: string }) {
  const { operator } = useOperator();
  const [location, setLocation] = useState<Location | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setState("loading");
      try {
        const params = new URLSearchParams({
          organizationId: operator.organizationId,
        });
        const response = await fetch(
          `/api/operator/listen/locations?${params}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("LOCATION_UNAVAILABLE");
        const payload = (await response.json()) as { items?: Location[] };
        if (controller.signal.aborted) return;
        setLocation(
          payload.items?.find((item) => item.id === deviceId) ?? null,
        );
        setState("ready");
      } catch {
        if (!controller.signal.aborted) setState("error");
      }
    };
    void load();
    return () => controller.abort();
  }, [deviceId, operator.organizationId]);

  return (
    <section
      className="rounded-lg border border-line bg-surface p-4"
      aria-label="Lokasi pemasangan alat LISTEN"
    >
      <h3 className="font-semibold text-ink">Lokasi pemasangan alat</h3>
      {state === "loading" && (
        <p className="mt-2 text-sm text-muted">Memuat lokasi...</p>
      )}
      {state === "error" && (
        <p role="alert" className="mt-2 text-sm text-danger">
          Lokasi perangkat gagal dimuat.
        </p>
      )}
      {state === "ready" && !location && (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-muted">
            Lokasi belum didaftarkan atau belum disetujui untuk ditampilkan.
          </p>
          <p className="text-muted">
            Admin dapat mendaftarkan koordinat dari lokasi alat yang sebenarnya.
          </p>
          <Link
            href="/admin/listen-locations"
            className="inline-flex rounded-md border border-line px-3 py-2 font-semibold text-brand hover:bg-brand-50"
          >
            Atur lokasi melalui Admin
          </Link>
        </div>
      )}
      {state === "ready" && location && (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Tempat pemasangan</dt>
            <dd className="font-medium text-ink">{location.label}</dd>
          </div>
          <div>
            <dt className="text-muted">Zona operasional alat</dt>
            <dd className="font-medium text-ink">
              {location.zoneName ?? "Belum ada zona yang mencakup titik ini"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Koordinat pemasangan</dt>
            <dd className="font-mono font-medium text-ink">
              {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <Link
              className="font-medium text-brand hover:underline"
              href="/operator/map"
            >
              Lihat di WebGIS
            </Link>
          </div>
        </dl>
      )}
    </section>
  );
}
