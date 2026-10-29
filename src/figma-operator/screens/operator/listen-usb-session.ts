"use client";

/** Browser-tab-scoped Web Serial connection. Never persisted as an online flag. */
type Port = {
  open(input: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};
type SerialProvider = {
  requestPort(): Promise<Port>;
  addEventListener?(event: "disconnect", listener: () => void): void;
};
export type UsbSnapshot = {
  connected: boolean;
  deviceId: string | null;
  auto: boolean | null;
  busy: boolean;
  info: string;
};
const EMPTY: UsbSnapshot = {
  connected: false,
  deviceId: null,
  auto: null,
  busy: false,
  info: "Diagnostik USB hanya tersedia jika kabel terhubung ke komputer ini.",
};
let snapshot = EMPTY;
const observers = new Set<() => void>();
let port: Port | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let readerTask: Promise<void> | null = null;
let closing = false;
let disconnectListening = false;
const emit = (update: Partial<UsbSnapshot>) => {
  snapshot = { ...snapshot, ...update };
  for (const observer of observers) observer();
};
export const getUsbSnapshot = () => snapshot;
export const subscribeUsb = (listener: () => void) => {
  observers.add(listener);
  return () => {
    observers.delete(listener);
  };
};
function provider() {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { serial?: SerialProvider }).serial ?? null;
}
export function usbAvailable() {
  return (
    typeof location !== "undefined" &&
    (location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
    !!provider()
  );
}
async function watch(current: Port) {
  const r = current.readable?.getReader();
  if (!r) {
    emit({ busy: false, info: "Serial tidak dapat dibaca." });
    return;
  }
  reader = r;
  let buffer = "";
  const decoder = new TextDecoder();
  try {
    while (!closing) {
      const result = await r.read();
      if (result.done) break;
      buffer = (buffer + decoder.decode(result.value, { stream: true })).slice(
        -2048,
      );
      const matches = [...buffer.matchAll(/AUTO monitoring: (ON|OFF)/g)];
      const last = matches.at(-1);
      if (last) {
        const on = last[1] === "ON";
        emit({
          auto: on,
          busy: false,
          info: on
            ? "Firmware: monitoring aktif."
            : "Firmware: monitoring dijeda.",
        });
        buffer = buffer.slice(-128);
      }
    }
  } catch {
    if (!closing)
      emit({ info: "USB terputus. Hubungkan ulang jika diperlukan." });
  } finally {
    r.releaseLock();
    reader = null;
    if (port === current && !closing) {
      port = null;
      emit({ connected: false, deviceId: null, auto: null, busy: false });
    }
  }
}
export async function connectUsb(deviceId: string) {
  if (!usbAvailable()) {
    emit({ info: "Web Serial memerlukan Chrome/Edge di localhost." });
    return;
  }
  if (port) {
    emit({
      info: "Sesi USB masih aktif. Lepaskan dahulu jika ingin memilih port lain.",
    });
    return;
  }
  emit({ busy: true });
  try {
    const p = await provider()?.requestPort();
    if (!p) throw new Error("Port tidak dipilih.");
    await p.open({ baudRate: 115200 });
    closing = false;
    port = p;
    emit({
      connected: true,
      deviceId,
      auto: null,
      info: "USB lokal terhubung. Identitas firmware belum diverifikasi.",
      busy: false,
    });
    if (!disconnectListening) {
      disconnectListening = true;
      provider()?.addEventListener?.("disconnect", () => {
        emit({
          connected: false,
          deviceId: null,
          auto: null,
          info: "Perangkat USB terputus.",
        });
        port = null;
      });
    }
    readerTask = watch(p);
  } catch (e) {
    emit({
      busy: false,
      info: e instanceof Error ? e.message : "USB gagal terhubung.",
    });
  }
}
export async function commandUsb(deviceId: string, command: "1" | "0" | "s") {
  if (!port?.writable || snapshot.deviceId !== deviceId) return;
  emit({
    busy: true,
    info: "Perintah USB terkirim, menunggu status firmware...",
  });
  try {
    const writer = port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(command));
    } finally {
      writer.releaseLock();
    }
    if (command === "s") emit({ busy: false });
  } catch {
    emit({ busy: false, info: "Gagal mengirim perintah USB." });
  }
}
export async function disconnectUsb() {
  const p = port;
  closing = true;
  emit({ busy: true });
  try {
    await reader?.cancel();
    await readerTask;
    await p?.close();
  } catch {
    emit({ info: "Port gagal ditutup; periksa Serial Monitor." });
  } finally {
    port = null;
    readerTask = null;
    emit({ connected: false, deviceId: null, auto: null, busy: false });
  }
}
