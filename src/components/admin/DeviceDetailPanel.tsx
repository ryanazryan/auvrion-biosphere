"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";

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
};
type Inventory = {
  organizationId: string;
  organizationName: string;
  devices: Device[];
};

export function DeviceDetailPanel({ deviceId }: { deviceId: string }) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/device-fleet", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await response.json()) as Inventory & { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? `HTTP ${response.status}`);
      setInventory(data);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Gagal memuat detail perangkat.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  const device = inventory?.devices.find(
    (entry) => entry.deviceId === deviceId || entry.sourceId === deviceId,
  );

  async function saveLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!device || !inventory || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/device-sources/${encodeURIComponent(device.sourceId)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: inventory.organizationId,
            label,
          }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? `HTTP ${response.status}`);
      setEditing(false);
      setMessage(
        "Nama tampilan perangkat diperbarui. Kode perangkat dan token tetap sama.",
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Gagal menyimpan nama perangkat.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5 text-ink">
      <Link
        href="/admin/devices"
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
      >
        <span aria-hidden="true">←</span> Kembali ke daftar perangkat
      </Link>
      {loading && (
        <p role="status" className="text-sm text-muted">
          Memuat detail perangkat...
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-lg bg-brand-50 p-3 text-sm text-brand"
        >
          {message}
        </p>
      )}
      {!loading && !device && !error && (
        <div className="rounded-xl border border-line bg-white p-8 text-center">
          <h1 className="text-xl font-semibold">Perangkat tidak ditemukan</h1>
          <p className="mt-2 text-sm text-muted">
            ID ini tidak tercatat di organisasi Admin.
          </p>
        </div>
      )}
      {device && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Detail perangkat ·{" "}
                {device.kind === "listen_device" ? "LISTEN" : "PREVENT"}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {device.label}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {device.code} · {inventory?.organizationName}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${device.deviceStatus === "active" ? "bg-green-50 text-green-800" : device.deviceStatus === "revoked" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}
            >
              {device.deviceStatus === "active"
                ? "Terdaftar aktif"
                : device.deviceStatus === "revoked"
                  ? "Registrasi dicabut"
                  : "Belum diprovision"}
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
            <div className="space-y-5">
              <div className="rounded-xl border border-line bg-white p-5 sm:p-6">
                <h2 className="text-lg font-semibold">Identitas perangkat</h2>
                <p className="mt-1 text-sm text-muted">
                  Informasi perangkat yang sudah tercatat, bukan formulir
                  pendaftaran ulang.
                </p>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted">Jenis</dt>
                    <dd className="mt-1 text-sm font-medium">
                      {device.kind === "listen_device"
                        ? "LISTEN — bioakustik"
                        : "PREVENT — pemantauan risiko"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Kode perangkat</dt>
                    <dd className="mt-1 break-all text-sm font-medium">
                      {device.code}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Organisasi</dt>
                    <dd className="mt-1 text-sm font-medium">
                      {inventory?.organizationName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Versi kredensial</dt>
                    <dd className="mt-1 text-sm font-medium">
                      {device.credentialVersion ?? "Belum tersedia"}
                    </dd>
                  </div>
                </dl>
                {device.kind === "listen_device" && (
                  <div className="mt-5 border-t border-line pt-4">
                    {!editing ? (
                      <button
                        type="button"
                        onClick={() => {
                          setLabel(device.label);
                          setEditing(true);
                        }}
                        className="rounded-md border border-line-strong px-3 py-2 text-sm font-semibold hover:bg-bg"
                      >
                        Edit nama tampilan
                      </button>
                    ) : (
                      <form
                        onSubmit={(event) => void saveLabel(event)}
                        className="space-y-3"
                      >
                        <label className="block text-sm font-medium">
                          Nama tampilan
                          <input
                            required
                            minLength={3}
                            maxLength={100}
                            value={label}
                            onChange={(event) => setLabel(event.target.value)}
                            className="mt-1 block w-full rounded-md border border-line-strong bg-white p-2"
                          />
                        </label>
                        <p className="text-xs text-muted">
                          Kode sumber dan ID perangkat tidak dapat diedit karena
                          digunakan oleh firmware dan rekaman lama.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={saving}
                            className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {saving ? "Menyimpan..." : "Simpan nama"}
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => setEditing(false)}
                            className="rounded-md border border-line px-3 py-2 text-sm font-semibold"
                          >
                            Batal
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-line bg-white p-5 sm:p-6">
                <h2 className="text-lg font-semibold">Lokasi pemasangan</h2>
                <p className="mt-1 text-sm text-muted">
                  Lokasi ini adalah posisi fisik alat, bukan posisi pasti satwa
                  atau kebakaran.
                </p>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted">Nama / alamat lokasi</dt>
                    <dd className="mt-1 text-sm font-medium">
                      {device.locationLabel || "Belum dicatat"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">
                      Penayangan ke Operator
                    </dt>
                    <dd className="mt-1 text-sm font-medium">
                      {device.locationDisclosureApproved
                        ? "Disetujui"
                        : "Tidak ditampilkan"}
                    </dd>
                  </div>
                </dl>
                {device.kind === "listen_device" && device.deviceId && (
                  <Link
                    href={`/admin/listen-locations?deviceId=${encodeURIComponent(device.deviceId)}`}
                    className="mt-5 inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Atur lokasi pemasangan
                  </Link>
                )}
              </div>
            </div>
            <aside className="space-y-5">
              <div className="rounded-xl border border-line bg-white p-5">
                <h2 className="font-semibold">Ilustrasi perangkat</h2>
                <div className="mt-4 grid min-h-60 place-items-center rounded-xl bg-[#f1f6f2] p-5">
                  <Image
                    src={
                      device.kind === "listen_device"
                        ? "/device-illustrations/listen-device.png"
                        : "/device-illustrations/prevent-device.png"
                    }
                    alt={
                      device.kind === "listen_device"
                        ? "Konsep visual perangkat LISTEN"
                        : "Konsep visual perangkat PREVENT"
                    }
                    width={280}
                    height={280}
                    className="h-auto max-h-[260px] w-auto object-contain"
                  />
                </div>
                <p className="mt-3 text-xs text-muted">
                  Ilustrasi konsep, bukan foto perangkat fisik yang terpasang.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-white p-5">
                <h2 className="font-semibold">Ringkasan perangkat</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Status registrasi</dt>
                    <dd className="font-semibold">
                      {device.deviceStatus ?? "Belum ada"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Rekaman diterima</dt>
                    <dd className="font-semibold">
                      {device.recordingCount ?? 0}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Koneksi Wi-Fi</dt>
                    <dd className="font-semibold">Tidak diketahui</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">RTC / microSD</dt>
                    <dd className="font-semibold">Tidak dilaporkan</dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-muted">
                  Tidak ada status online palsu. Koneksi dan kesehatan sensor
                  hanya ditampilkan jika telemetri tersedia.
                </p>
                {device.kind === "listen_device" && device.deviceId && (
                  <Link
                    href="/admin/devices/new"
                    className="mt-4 inline-block rounded-md border border-line-strong px-3 py-2 text-xs font-semibold text-ink hover:bg-bg"
                  >
                    Kelola kredensial / registrasi
                  </Link>
                )}
              </div>
              {!device.deviceId && device.kind === "listen_device" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                  <h2 className="font-semibold">Sumber belum terdaftar</h2>
                  <p className="mt-2 text-sm">
                    Lanjutkan provisioning untuk menghubungkan ESP32 dengan
                    kredensial perangkat baru.
                  </p>
                  <Link
                    href="/admin/devices/new"
                    className="mt-3 inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
                  >
                    Buka wizard provisioning
                  </Link>
                </div>
              )}
              {device.kind === "prevent_device" && (
                <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">
                  Layanan kredensial dan telemetri PREVENT belum diaktifkan.
                  Halaman ini hanya menampilkan sumber yang tercatat.
                </p>
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
