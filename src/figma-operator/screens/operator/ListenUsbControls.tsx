"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  commandUsb,
  connectUsb,
  disconnectUsb,
  getUsbSnapshot,
  subscribeUsb,
  usbAvailable,
} from "./listen-usb-session";

/** USB is optional diagnostics; internet remote state comes from the backend. */
export function ListenUsbControls({ deviceId }: { deviceId?: string | null }) {
  const snapshot = useSyncExternalStore(
    subscribeUsb,
    getUsbSnapshot,
    getUsbSnapshot,
  );
  const [opened, setOpened] = useState(false);
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(usbAvailable()), []);
  const ownsSession =
    !!deviceId && snapshot.connected && snapshot.deviceId === deviceId;
  const foreignSession = snapshot.connected && !ownsSession;
  return (
    <section className="mb-5 rounded-xl border border-line bg-surface p-4">
      <button
        type="button"
        aria-expanded={opened}
        onClick={() => setOpened((x) => !x)}
        className="flex w-full items-center justify-between text-left font-semibold text-ink"
      >
        <span>Diagnostik USB (lokal)</span>
        <span className="text-xs font-medium text-muted">
          {ownsSession ? "USB tersambung" : "Opsional"} ·{" "}
          {opened ? "Tutup" : "Buka"}
        </span>
      </button>
      {opened && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-ink">
            {ownsSession
              ? snapshot.auto === null
                ? "USB tersambung · menunggu status"
                : snapshot.auto
                  ? "USB · monitoring aktif"
                  : "USB · monitoring dijeda"
              : foreignSession
                ? "USB sedang digunakan pada detail perangkat lain"
                : "USB belum terhubung"}
          </p>
          <div className="flex flex-wrap gap-2">
            {!snapshot.connected ? (
              <button
                type="button"
                disabled={!supported || !deviceId || snapshot.busy}
                onClick={() => {
                  if (deviceId) void connectUsb(deviceId);
                }}
                className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-bg disabled:opacity-50"
              >
                Hubungkan ESP32
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={
                    !ownsSession || snapshot.busy || snapshot.auto !== false
                  }
                  onClick={() => {
                    if (deviceId) void commandUsb(deviceId, "1");
                  }}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Mulai USB
                </button>
                <button
                  type="button"
                  disabled={
                    !ownsSession || snapshot.busy || snapshot.auto !== true
                  }
                  onClick={() => {
                    if (deviceId) void commandUsb(deviceId, "0");
                  }}
                  className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Jeda USB
                </button>
                <button
                  type="button"
                  disabled={!ownsSession || snapshot.busy}
                  onClick={() => {
                    if (deviceId) void commandUsb(deviceId, "s");
                  }}
                  className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40"
                >
                  Perbarui status
                </button>
                <button
                  type="button"
                  disabled={snapshot.busy}
                  onClick={() => void disconnectUsb()}
                  className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40"
                >
                  Lepas USB
                </button>
              </>
            )}
          </div>
          <p role="status" className="text-xs text-muted">
            {snapshot.info}
          </p>
          <p className="text-xs text-muted">
            Koneksi USB bertahan saat navigasi dalam tab yang sama. Pilihan
            perangkat USB belum diverifikasi terhadap UUID firmware. Status
            remote HTTPS tetap terpisah.
          </p>
        </div>
      )}
    </section>
  );
}
