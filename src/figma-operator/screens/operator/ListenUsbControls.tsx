"use client";

import { useEffect, useRef, useState } from "react";

type Port = {
  open(v: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};

type SerialProvider = {
  requestPort(): Promise<Port>;
};

export function ListenUsbControls() {
  const port = useRef<Port | null>(null);
  const reader = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const reading = useRef<Promise<void> | null>(null);
  const closing = useRef(false);

  const [supported, setSupported] = useState(false);
  const [connected, setConnected] = useState(false);
  const [auto, setAuto] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(
    "Hubungkan ESP32 lewat USB untuk membaca status firmware.",
  );

  useEffect(() => {
    setSupported(
      (location.hostname === "localhost" ||
        location.hostname === "127.0.0.1") &&
        !!(navigator as Navigator & { serial?: SerialProvider }).serial,
    );
    return () => {
      closing.current = true;
      void reader.current?.cancel().catch(() => undefined);
    };
  }, []);

  async function watch(p: Port) {
    const r = p.readable?.getReader();
    if (!r) return;
    reader.current = r;
    let buffer = "";
    const decoder = new TextDecoder();

    try {
      while (!closing.current) {
        const { value, done } = await r.read();
        if (done) break;

        buffer = (buffer + decoder.decode(value, { stream: true })).slice(
          -1024,
        );

        const matches = [...buffer.matchAll(/AUTO monitoring: (ON|OFF)/g)];
        const last = matches[matches.length - 1];

        if (last) {
          const enabled = last[1] === "ON";
          setAuto(enabled);
          setBusy(false);
          setInfo(
            enabled
              ? "Firmware mengonfirmasi: perekaman otomatis aktif."
              : "Firmware mengonfirmasi: perekaman otomatis dijeda.",
          );
          buffer = buffer.slice(-64);
        }
      }
    } catch {
      if (!closing.current) {
        setInfo("Port terputus. Hubungkan ulang.");
      }
    } finally {
      r.releaseLock();
      reader.current = null;
      if (!closing.current) {
        setConnected(false);
        setAuto(null);
      }
    }
  }

  async function connect() {
    setBusy(true);
    try {
      const provider = (navigator as Navigator & { serial?: SerialProvider })
        .serial;
      if (!provider) throw new Error("Web Serial tidak tersedia.");

      const p = await provider.requestPort();
      await p.open({ baudRate: 115200 });

      closing.current = false;
      port.current = p;
      setConnected(true);
      setAuto(null);
      setInfo("USB terhubung. Menunggu status firmware...");
      reading.current = watch(p);
    } catch (e) {
      setInfo(e instanceof Error ? e.message : "Gagal koneksi USB.");
    } finally {
      setBusy(false);
    }
  }

  async function send(command: "1" | "0" | "s") {
    if (!port.current?.writable) return;

    setBusy(true);
    setInfo("Perintah dikirim; menunggu konfirmasi firmware...");

    try {
      const writer = port.current.writable.getWriter();
      try {
        await writer.write(new TextEncoder().encode(command));
      } finally {
        writer.releaseLock();
      }
    } catch {
      setBusy(false);
      setInfo("Gagal mengirim perintah.");
    }
  }

  async function disconnect() {
    closing.current = true;
    setBusy(true);
    try {
      await reader.current?.cancel();
      await reading.current;
      await port.current?.close();
    } catch {
      setInfo("Port belum tertutup. Tutup tab browser jika perlu.");
    } finally {
      port.current = null;
      reading.current = null;
      setConnected(false);
      setAuto(null);
      setBusy(false);
    }
  }

  return (
    <section className="mb-5 rounded-lg border border-line bg-surface p-4">
      <h2 className="font-semibold text-ink">Kontrol Perekaman LISTEN</h2>
      <p className="mt-1 text-xs text-muted">
        Kontrol ESP32 via USB lokal, bukan koneksi remote internet. Gunakan
        Chrome atau Edge di localhost.
      </p>

      <p className="mt-3 text-sm font-medium text-ink">
        {!connected
          ? "USB belum terhubung"
          : auto === null
            ? "Menunggu status firmware"
            : auto
              ? "Rekam otomatis aktif"
              : "Rekam otomatis dijeda"}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {!connected ? (
          <button
            type="button"
            disabled={!supported || busy}
            onClick={() => void connect()}
            className="rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50"
          >
            Hubungkan ESP32
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy || auto !== false}
              onClick={() => void send("1")}
              className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Mulai Rekam Otomatis
            </button>
            <button
              type="button"
              disabled={busy || auto !== true}
              onClick={() => void send("0")}
              className="rounded-md bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Jeda Perekaman
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void send("s")}
              className="rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50"
            >
              Perbarui Status
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void disconnect()}
              className="rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50"
            >
              Lepas USB
            </button>
          </>
        )}
      </div>

      <p role="status" aria-live="polite" className="mt-3 text-xs text-muted">
        {!supported ? "Web Serial memerlukan Chrome/Edge di localhost. " : ""}
        {info}
      </p>
      <p className="mt-2 text-xs text-muted">
        Jeda tidak membatalkan WAV yang sedang berlangsung. Upload file yang
        sudah direkam tetap berjalan.
      </p>
    </section>
  );
}
