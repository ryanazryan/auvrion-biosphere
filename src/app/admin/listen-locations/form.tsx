"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { SelectMenu } from "@/components/ui/SelectMenu";

type Device = {
  id: string;
  code: string;
  label: string;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  verificationMethod: string | null;
  disclosureApproved: boolean;
};

export function ListenLocationForm({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [label, setLabel] = useState("");
  const [method, setMethod] = useState("manual_map_verified");
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [findingPosition, setFindingPosition] = useState(false);
  const [message, setMessage] = useState("");
  const [positionAccuracy, setPositionAccuracy] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const qs = new URLSearchParams({ organizationId });
        const response = await fetch(`/api/admin/listen-locations?${qs}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("LIST_FAILED");
        const data = (await response.json()) as { devices?: Device[] };
        if (controller.signal.aborted) return;
        const next = data.devices ?? [];
        setDevices(next);
        const requestedId = new URLSearchParams(window.location.search).get(
          "deviceId",
        );
        const selected =
          next.find((item) => item.id === requestedId) ?? next[0];
        setDeviceId(selected?.id ?? "");
        setLabel(selected?.locationLabel ?? "");
        setLatitude(
          selected?.latitude == null ? "" : String(selected.latitude),
        );
        setLongitude(
          selected?.longitude == null ? "" : String(selected.longitude),
        );
        setMethod(selected?.verificationMethod ?? "manual_map_verified");
        setApproved(selected?.disclosureApproved ?? false);
      } catch {
        if (!controller.signal.aborted)
          setMessage("Daftar perangkat tidak dapat dimuat.");
      }
    };
    void load();
    return () => controller.abort();
  }, [organizationId]);

  function chooseDevice(id: string) {
    setDeviceId(id);
    const device = devices.find((item) => item.id === id);
    setLabel(device?.locationLabel ?? "");
    setLatitude(device?.latitude == null ? "" : String(device.latitude));
    setLongitude(device?.longitude == null ? "" : String(device.longitude));
    setMethod(device?.verificationMethod ?? "manual_map_verified");
    setApproved(device?.disclosureApproved ?? false);
    setMessage("");
    setPositionAccuracy(null);
  }

  function useCurrentPosition() {
    if (!navigator.geolocation) {
      setMessage("Browser ini tidak menyediakan akses lokasi.");
      return;
    }
    setFindingPosition(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setPositionAccuracy(Math.round(position.coords.accuracy));
        setMethod("manual_map_verified");
        setMessage(
          "Posisi browser terisi. Periksa terhadap lokasi ESP32 sebelum menyimpan.",
        );
        setFindingPosition(false);
      },
      () => {
        setMessage(
          "Lokasi tidak tersedia. Masukkan koordinat pemasangan secara manual.",
        );
        setFindingPosition(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deviceId || !latitude.trim() || !longitude.trim() || !label.trim()) {
      setMessage("Pilih alat, nama lokasi, dan isi kedua koordinat.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/listen-locations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          deviceId,
          latitude: Number(latitude),
          longitude: Number(longitude),
          label: label.trim(),
          method,
          disclosureApproved: approved,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? `HTTP ${response.status}`);
      setMessage(
        approved
          ? "Lokasi tersimpan dan dapat ditampilkan di WebGIS."
          : "Lokasi tersimpan, masih tersembunyi dari Operator.",
      );
    } catch (error) {
      setMessage(
        `Gagal menyimpan: ${error instanceof Error ? error.message : "KESALAHAN_SERVER"}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-ink">
      <Link
        href="/admin/devices"
        className="text-sm font-medium text-brand hover:underline"
      >
        Kembali ke Admin
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Lokasi perangkat LISTEN</h1>
        <p className="mt-1 text-sm text-muted">{organizationName}</p>
      </div>
      <form
        onSubmit={submit}
        className="space-y-4 rounded-xl border border-line bg-surface p-5"
      >
        <div className="block text-sm font-medium">
          Perangkat ESP32
          <SelectMenu
            label="Perangkat ESP32"
            value={deviceId}
            options={devices.map((device) => ({
              value: device.id,
              label: `${device.code} — ${device.label}`,
            }))}
            onChange={chooseDevice}
          />
        </div>
        {devices.length === 0 && (
          <p className="text-sm text-muted">
            Belum ada perangkat aktif yang tersedia untuk organisasi ini.
          </p>
        )}
        <label className="block text-sm font-medium">
          Nama / alamat lokasi pemasangan
          <input
            required
            minLength={3}
            maxLength={120}
            className="mt-1 w-full rounded-md border border-line bg-white p-2"
            placeholder="Contoh: Titik uji halaman rumah"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Latitude
            <input
              required
              type="number"
              min={-12}
              max={8}
              step="any"
              className="mt-1 w-full rounded-md border border-line bg-white p-2"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Longitude
            <input
              required
              type="number"
              min={94}
              max={142}
              step="any"
              className="mt-1 w-full rounded-md border border-line bg-white p-2"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={useCurrentPosition}
          disabled={findingPosition || busy}
          className="rounded-md border border-line-strong bg-bg px-3 py-2 text-sm font-medium text-ink hover:bg-brand-50 disabled:opacity-50"
        >
          {findingPosition
            ? "Mencari lokasi..."
            : "Ambil posisi saya (jika dekat ESP32)"}
        </button>
        {positionAccuracy !== null && (
          <p className="text-xs text-muted">
            Perkiraan akurasi browser: ±{positionAccuracy} meter. Verifikasi
            titik sebelum menyimpan.
          </p>
        )}
        <p className="text-xs leading-5 text-muted">
          Jika Anda mengakses Admin dari tempat lain, salin koordinat pemasangan
          ESP32 yang sebenarnya dari peta atau GPS lapangan. Posisi laptop yang
          jauh dari sensor tidak boleh digunakan.
        </p>
        <div className="block text-sm font-medium">
          Metode verifikasi
          <SelectMenu
            label="Metode verifikasi"
            value={method}
            options={[
              { value: "manual_map_verified", label: "Diperiksa pada peta" },
              { value: "field_gps", label: "Diukur GPS di lokasi" },
            ]}
            onChange={setMethod}
          />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={approved}
            onChange={(event) => setApproved(event.target.checked)}
          />
          <span>
            Izinkan lokasi pemasangan ini ditampilkan kepada Operator
            organisasi.
          </span>
        </label>
        <button
          type="submit"
          disabled={busy || !deviceId}
          className="rounded-md bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Menyimpan..." : "Simpan lokasi alat"}
        </button>
        {message && (
          <p role="status" className="text-sm text-ink">
            {message}
          </p>
        )}
      </form>
      <p className="text-xs text-muted">
        Koordinat pemasangan mikrofon tidak sama dengan posisi pasti satwa yang
        terekam.
      </p>
    </main>
  );
}
