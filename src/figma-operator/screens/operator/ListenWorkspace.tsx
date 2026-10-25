"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { OperatorLayout } from "../../components/operator/OperatorLayout";
import { useOperator } from "../../operator-context";

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
type Fleet = {
  devices: Device[];
  checkedAt: string;
  truncated: boolean;
  connectivityAvailable: false;
};
type Receipt = {
  receiptId: string;
  recordingId: string;
  observationId: string;
  receivedAt: string;
  durationMs: number;
  audioBytes: number;
  ingestionMode: "live" | "historical" | "simulation";
  clockQuality: "rtc_verified" | "unverified";
  observedAt: string | null;
  observationQuality: "unreviewed" | "valid" | "suspect" | "invalid";
};
type History = {
  deviceId: string;
  checkedAt: string;
  hasMore: boolean;
  recordings: Receipt[];
};

function dateLabel(value: string | null, zone: string) {
  if (!value) return "Belum tersedia";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Waktu tidak valid";
  const timeZone =
    zone === "WIB"
      ? "Asia/Jakarta"
      : zone === "WIT"
        ? "Asia/Jayapura"
        : "Asia/Makassar";
  return `${date.toLocaleString("id-ID", { timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} ${zone}`;
}

function registration(status: Device["registrationStatus"]) {
  if (status === "revoked") return "Kredensial dicabut";
  if (status === "source_inactive") return "Sumber tidak aktif";
  return "Registrasi aktif";
}
function ingestMode(mode: Receipt["ingestionMode"] | null) {
  if (mode === "simulation") return "Simulasi";
  if (mode === "historical") return "Unggahan historis";
  if (mode === "live") return "Dinyatakan live oleh perangkat";
  return "Belum diketahui";
}
function quality(value: Receipt["observationQuality"]) {
  if (value === "valid") return "Kualitas observasi: valid";
  if (value === "suspect") return "Kualitas observasi: meragukan";
  if (value === "invalid") return "Kualitas observasi: tidak valid";
  return "Observasi belum ditinjau";
}
function quantity(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

/** Read-only fleet UI. It does not claim connectivity, persisted AI jobs, or real-time species detections. */
export function ListenWorkspace() {
  const { operator, timeZone } = useOperator();
  const org = operator.organizationId;
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [loading, setLoading] = useState(true);
  const [fleetError, setFleetError] = useState("");
  const [filter, setFilter] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      const response = await fetch(
        `/api/operator/listen?organizationId=${encodeURIComponent(org)}`,
        {
          credentials: "same-origin",
          cache: "no-store",
          signal: request.signal,
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json: unknown = await response.json();
      if (
        !json ||
        typeof json !== "object" ||
        !("devices" in json) ||
        !Array.isArray(json.devices)
      ) {
        throw new Error("Invalid fleet response");
      }
      if (sequence === requestSequence.current) {
        setFleet(json as Fleet);
        setFleetError("");
      }
    } catch {
      if (!request.signal.aborted && sequence === requestSequence.current) {
        setFleetError(
          "Gagal mengambil data jaringan LISTEN. Data sebelumnya mungkin sudah kedaluwarsa.",
        );
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      controller.current?.abort();
      requestSequence.current += 1;
    };
  }, [refresh]);

  const selected =
    fleet?.devices.find((d) => d.id === chosenId) ?? fleet?.devices[0] ?? null;
  const selectedId = selected?.id ?? null;
  const visibleHistory = history?.deviceId === selectedId ? history : null;
  const snapshotAt = fleet?.checkedAt;
  useEffect(() => {
    setHistory(null);
    setHistoryError("");
    if (!selectedId) return;
    const request = new AbortController();
    async function load() {
      setHistoryLoading(true);
      try {
        const url = `/api/operator/listen/recordings?organizationId=${encodeURIComponent(org)}&deviceId=${encodeURIComponent(selectedId ?? "")}`;
        const response = await fetch(url, {
          credentials: "same-origin",
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json: unknown = await response.json();
        if (
          !json ||
          typeof json !== "object" ||
          !("recordings" in json) ||
          !Array.isArray(json.recordings)
        ) {
          throw new Error("Invalid history response");
        }
        if (!request.signal.aborted) setHistory(json as History);
      } catch {
        if (!request.signal.aborted)
          setHistoryError("Riwayat rekaman tidak dapat diambil.");
      } finally {
        if (!request.signal.aborted) setHistoryLoading(false);
      }
    }
    void snapshotAt;
    void load();
    return () => request.abort();
  }, [org, selectedId, snapshotAt]);

  const filtered =
    fleet?.devices.filter(
      (d) =>
        (!onlyActive || d.registrationStatus === "active") &&
        `${d.code} ${d.label}`
          .toLowerCase()
          .includes(filter.trim().toLowerCase()),
    ) ?? [];
  const totalReceipts =
    fleet?.devices.reduce((sum, item) => sum + item.recordingCount, 0) ?? 0;
  const lastReceipt =
    fleet?.devices.reduce<string | null>((latest, d) => {
      if (!d.lastReceivedAt) return latest;
      return !latest || d.lastReceivedAt > latest ? d.lastReceivedAt : latest;
    }, null) ?? null;

  return (
    <OperatorLayout
      path="/operator/listen"
      crumbs={[
        { label: "Ringkasan", href: "/operator/overview" },
        { label: "Jaringan LISTEN" },
      ]}
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            Bioakustik · Jaringan sensor
          </p>
          <h1 className="text-2xl font-semibold text-ink">Jaringan LISTEN</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted">
            Pantau perangkat terdaftar, penerimaan WAV, dan riwayat observasi.
            Status jaringan berasal dari database organisasi, bukan simulasi
            koneksi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-md border border-line px-3 py-2 text-sm font-medium text-fg hover:bg-bg"
        >
          Segarkan data
        </button>
      </header>

      {fleetError && (
        <p
          role="alert"
          className="mb-3 rounded-md border border-line bg-bg px-4 py-2 text-sm text-warn"
        >
          {fleetError}
        </p>
      )}
      <section
        aria-label="Ringkasan jaringan LISTEN"
        className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {[
          {
            label: "Perangkat terdaftar",
            value: quantity(fleet?.devices.length ?? 0),
            note: fleet?.truncated
              ? "Hanya 50 perangkat pertama"
              : "Identitas yang terdaftar",
          },
          {
            label: "Registrasi aktif",
            value: quantity(
              fleet?.devices.filter((d) => d.registrationStatus === "active")
                .length ?? 0,
            ),
            note: "Tidak menyatakan online",
          },
          {
            label: "Rekaman diterima",
            value: quantity(totalReceipts),
            note: "Receipt WC-017 di database",
          },
          {
            label: "Terakhir diterima",
            value: lastReceipt ? dateLabel(lastReceipt, timeZone) : "—",
            note: "Waktu server",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-line bg-surface p-4"
          >
            <p className="text-xs text-muted">{card.label}</p>
            <p className="mt-1 break-words text-lg font-semibold text-ink">
              {card.value}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">{card.note}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.5fr)]">
        <section
          aria-label="Daftar perangkat"
          className="overflow-hidden rounded-lg border border-line bg-surface"
        >
          <header className="space-y-3 border-b border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-ink">Perangkat LISTEN</h2>
              <span className="text-xs text-muted">
                Pembaruan setiap 15 detik
              </span>
            </div>
            <label className="block text-xs text-muted">
              Cari perangkat
              <input
                type="search"
                placeholder="Kode atau nama perangkat"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-brand"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={onlyActive}
                onChange={(event) => setOnlyActive(event.target.checked)}
                className="accent-brand"
              />
              Hanya registrasi aktif
            </label>
          </header>
          {loading && !fleet ? (
            <p className="p-5 text-sm text-muted" role="status">
              Memuat daftar perangkat...
            </p>
          ) : fleet && fleet.devices.length === 0 ? (
            <div className="space-y-2 p-5 text-sm">
              <p className="font-medium text-ink">
                Belum ada perangkat terdaftar
              </p>
              <p className="text-muted">
                Administrator dapat mendaftarkan sumber LISTEN dan perangkat
                setelah firmware siap. Tidak ada status online yang
                disimulasikan.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-5 text-sm text-muted">
              Tidak ada perangkat yang sesuai filter.
            </p>
          ) : (
            <div className="max-h-[34rem] divide-y divide-line overflow-y-auto">
              {filtered.map((device) => (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => setChosenId(device.id)}
                  aria-pressed={selectedId === device.id}
                  className={`w-full space-y-2 px-4 py-3 text-left transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-brand ${selectedId === device.id ? "bg-brand-50" : ""}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink">
                      {device.code}
                    </span>
                    <span className="rounded-md border border-line px-2 py-0.5 text-[11px] text-muted">
                      {registration(device.registrationStatus)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted">{device.label}</p>
                  <p className="text-xs text-muted">
                    {quantity(device.recordingCount)} rekaman ·{" "}
                    {device.lastReceivedAt
                      ? dateLabel(device.lastReceivedAt, timeZone)
                      : "belum menerima WAV"}
                  </p>
                </button>
              ))}
            </div>
          )}
          {fleet?.truncated && (
            <p className="border-t border-line p-3 text-xs text-muted">
              Daftar dibatasi pada 50 perangkat pertama. Ringkasan bukan total
              jaringan keseluruhan.
            </p>
          )}
        </section>

        <section
          aria-label="Detail perangkat dan rekaman"
          className="min-w-0 space-y-4"
        >
          {!selected ? (
            <div className="rounded-lg border border-line bg-surface p-6 text-sm text-muted">
              Pilih perangkat LISTEN untuk melihat data perekaman sebenarnya.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">
                      {selected.code}
                    </h2>
                    <p className="text-sm text-muted">{selected.label}</p>
                  </div>
                  <span className="rounded-md border border-line bg-bg px-2 py-1 text-xs font-medium text-muted">
                    Koneksi: belum diketahui
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 border-t border-line pt-3 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">Status registrasi</dt>
                    <dd className="mt-1 font-medium text-fg">
                      {registration(selected.registrationStatus)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Jumlah WAV diterima</dt>
                    <dd className="mt-1 font-medium text-fg">
                      {quantity(selected.recordingCount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Waktu penerimaan terakhir</dt>
                    <dd className="mt-1 font-medium text-fg">
                      {dateLabel(selected.lastReceivedAt, timeZone)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Mode pengiriman terakhir</dt>
                    <dd className="mt-1 font-medium text-fg">
                      {ingestMode(selected.lastIngestionMode)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 rounded-md bg-bg p-3 text-xs leading-5 text-muted">
                  Belum ada heartbeat WC-017. Registrasi aktif dan receipt
                  terbaru tidak membuktikan perangkat sedang online. Monitoring
                  ini merupakan pembaruan data penerimaan, bukan live audio
                  streaming.
                </p>
              </div>

              <div className="overflow-hidden rounded-lg border border-line bg-surface">
                <header className="border-b border-line px-4 py-3">
                  <h3 className="font-semibold text-ink">
                    Riwayat rekaman terima
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    20 receipt WC-017 terbaru untuk perangkat terpilih. Audio
                    privat tetap dibuka melalui alur otorisasi terpisah.
                  </p>
                </header>
                {historyError && (
                  <p role="alert" className="p-4 text-sm text-warn">
                    {historyError}
                  </p>
                )}
                {historyLoading ? (
                  <p role="status" className="p-5 text-sm text-muted">
                    Mengambil riwayat...
                  </p>
                ) : visibleHistory?.recordings.length === 0 ? (
                  <p className="p-5 text-sm text-muted">
                    Belum ada rekaman diterima dari perangkat ini.
                  </p>
                ) : visibleHistory ? (
                  <ul className="divide-y divide-line">
                    {visibleHistory.recordings.map((item) => (
                      <li
                        key={item.receiptId}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="break-all text-xs font-medium text-ink">
                            {item.recordingId}
                          </p>
                          <p className="text-xs text-muted">
                            Diterima {dateLabel(item.receivedAt, timeZone)} ·{" "}
                            {(item.durationMs / 1000).toFixed(1)} dtk ·{" "}
                            {(item.audioBytes / 1024).toFixed(1)} KiB
                          </p>
                          <p className="text-xs text-muted">
                            {ingestMode(item.ingestionMode)} ·{" "}
                            {quality(item.observationQuality)}
                          </p>
                          {item.clockQuality === "unverified" && (
                            <p className="text-xs text-muted">
                              Jam perangkat belum diverifikasi
                            </p>
                          )}
                          {item.observedAt && (
                            <p className="text-xs text-muted">
                              Waktu menurut RTC:{" "}
                              {dateLabel(item.observedAt, timeZone)}
                            </p>
                          )}
                        </div>
                        <Link
                          href={`/operator/observations/${encodeURIComponent(item.observationId)}`}
                          className="shrink-0 rounded-md border border-line px-3 py-2 text-xs font-medium text-brand hover:bg-bg"
                        >
                          Buka observasi
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-5 text-sm text-muted">
                    Menunggu data riwayat perangkat.
                  </p>
                )}
                {visibleHistory?.hasMore && (
                  <p className="border-t border-line px-4 py-3 text-xs text-muted">
                    Ada riwayat lama yang belum ditampilkan. Paginasi lengkap
                    adalah tahap berikutnya.
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-line bg-surface p-4">
                <h3 className="font-semibold text-ink">
                  Analisis dan verifikasi
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted">
                  WC-023 sudah mendukung analisis Perch untuk WAV manusia yang
                  terhubung ke observasi, tetapi receipt perangkat WC-017 belum
                  mempunyai jalur replay AI persisten. Karenanya tidak ada hasil
                  identifikasi spesies atau status job AI yang dibuat-buat di
                  halaman ini.
                </p>
                {selected.latestObservationId && (
                  <Link
                    href={`/operator/observations/${encodeURIComponent(selected.latestObservationId)}`}
                    className="mt-3 inline-block text-sm font-medium text-brand underline-offset-2 hover:underline"
                  >
                    Tinjau observasi terbaru
                  </Link>
                )}
              </div>
            </>
          )}
        </section>
      </div>
      <footer className="mt-5 text-xs leading-5 text-muted">
        Snapshot server: {dateLabel(fleet?.checkedAt ?? null, timeZone)}. Semua
        angka berasal dari maksimal 50 perangkat pertama. Fitur deteksi spesies
        per-segmen, status online dari heartbeat, dan rekaman kontinu tetap
        memerlukan implementasi dan pengujian terpisah.
      </footer>
    </OperatorLayout>
  );
}
