"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useOperator } from "@/figma-operator/operator-context";

type Action = "start" | "pause" | "interval";
type Status = {
  deviceId: string;
  pending: boolean;
  commandRevision: number;
  appliedRevision: number;
  desiredAction: Action | null;
  intervalSeconds: number;
  reportedMonitoring: boolean | null;
  reportedIntervalSeconds: number | null;
  lastSeenAt: string | null;
  lastAcknowledgedAt: string | null;
};
type CommandIntent = {
  deviceId: string;
  action: Action;
  revision: number;
  intervalSeconds: number;
};

const INTERVALS = [
  { value: 60, label: "1 menit" },
  { value: 300, label: "5 menit" },
  { value: 900, label: "15 menit" },
] as const;

export function ListenRemoteControls({
  deviceId,
}: {
  deviceId: string | null;
}) {
  const { operator, timeZone } = useOperator();
  const [status, setStatus] = useState<Status | null>(null);
  const [intervalSeconds, setIntervalSeconds] = useState(300);
  const [intervalDirty, setIntervalDirty] = useState(false);
  const [sending, setSending] = useState<Action | null>(null);
  const [intent, setIntent] = useState<CommandIntent | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [intervalOpen, setIntervalOpen] = useState(false);
  const intervalRootRef = useRef<HTMLDivElement>(null);
  const intervalTriggerRef = useRef<HTMLButtonElement>(null);
  const intervalOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const intervalMenuId = useId();

  useEffect(() => {
    if (!intervalOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!intervalRootRef.current?.contains(event.target as Node)) {
        setIntervalOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIntervalOpen(false);
        intervalTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [intervalOpen]);

  function selectInterval(next: number) {
    setIntervalSeconds(next);
    setIntervalDirty(true);
    setIntervalOpen(false);
    intervalTriggerRef.current?.focus();
  }

  function moveIntervalFocus(current: number, direction: number) {
    const target = (current + direction + INTERVALS.length) % INTERVALS.length;
    intervalOptionRefs.current[target]?.focus();
  }

  const fetchStatus = useCallback(
    async (signal?: AbortSignal) => {
      if (!deviceId) {
        setStatus(null);
        return;
      }
      try {
        const qs = new URLSearchParams({
          organizationId: operator.organizationId,
          deviceId,
        });
        const response = await fetch(`/api/operator/listen/remote?${qs}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = (await response.json()) as Status;
        if (result.deviceId !== deviceId)
          throw new Error("WRONG_DEVICE_STATUS");
        if (signal?.aborted) return;
        setStatus(result);
        if (!intervalDirty) setIntervalSeconds(result.intervalSeconds);
        setError("");
      } catch {
        if (!signal?.aborted) {
          setStatus(null);
          setError("Status perangkat tidak dapat diperbarui.");
        }
      }
    },
    [operator.organizationId, deviceId, intervalDirty],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchStatus(controller.signal);
    const timer = window.setInterval(
      () => {
        if (!document.hidden) void fetchStatus(controller.signal);
      },
      intent?.deviceId === deviceId ||
        (status?.deviceId === deviceId && status.pending)
        ? 3000
        : 10000,
    );
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [fetchStatus, intent, status?.pending, deviceId, status?.deviceId]);

  useEffect(() => {
    if (
      !intent ||
      intent.deviceId !== deviceId ||
      !status ||
      status.deviceId !== deviceId
    )
      return;
    if (status.commandRevision < intent.revision || status.pending) return;
    if (status.commandRevision > intent.revision) {
      setIntent(null);
      setFeedback("Perintah digantikan oleh perubahan dari sesi lain.");
      return;
    }
    if (status.appliedRevision < intent.revision) return;

    const matched =
      intent.action === "start"
        ? status.reportedMonitoring === true
        : intent.action === "pause"
          ? status.reportedMonitoring === false
          : status.reportedIntervalSeconds === intent.intervalSeconds;
    setIntent(null);
    if (!matched) {
      setFeedback("");
      setError(
        "ESP32 merespons, tetapi status akhirnya belum sesuai. Segarkan status.",
      );
      return;
    }
    if (intent.action === "start")
      setFeedback("Monitoring aktif — dikonfirmasi ESP32.");
    if (intent.action === "pause")
      setFeedback("Monitoring dijeda — dikonfirmasi ESP32.");
    if (intent.action === "interval") {
      setIntervalDirty(false);
      setFeedback("Interval rekaman sudah diterapkan di ESP32.");
    }
  }, [deviceId, intent, status]);

  async function dispatch(action: Action) {
    if (
      !deviceId ||
      sending ||
      (status?.deviceId === deviceId && status.pending)
    )
      return;
    setSending(action);
    setError("");
    setFeedback("Mengirim perintah ke server...");
    try {
      const response = await fetch("/api/operator/listen/remote", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: operator.organizationId,
          deviceId,
          action,
          intervalSeconds,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = (await response.json()) as { revision?: number };
      if (typeof result.revision !== "number")
        throw new Error("INVALID_REVISION");
      setIntent({
        deviceId,
        action,
        revision: result.revision,
        intervalSeconds,
      });
      setFeedback("Perintah dikirim. Menunggu konfirmasi dari ESP32...");
      await fetchStatus();
    } catch {
      setIntent(null);
      setFeedback("");
      setError(
        "Perintah gagal dikirim. Periksa koneksi perangkat dan akses akun.",
      );
    } finally {
      setSending(null);
    }
  }

  const currentStatus = status?.deviceId === deviceId ? status : null;
  const currentIntent = intent?.deviceId === deviceId ? intent : null;
  const lastSeenMs = currentStatus?.lastSeenAt
    ? Date.parse(currentStatus.lastSeenAt)
    : NaN;
  const age = Date.now() - lastSeenMs;
  const communicating = Number.isFinite(age) && age >= 0 && age < 90000;
  const confirmed = currentStatus?.reportedMonitoring;
  const activeStart = communicating && confirmed === true;
  const queuedAction = currentStatus?.pending
    ? currentStatus.desiredAction
    : currentIntent?.action;
  const startPending = queuedAction === "start" || sending === "start";
  const pausePending = queuedAction === "pause" || sending === "pause";
  const intervalPending = queuedAction === "interval" || sending === "interval";
  const locked =
    !deviceId ||
    !communicating ||
    sending !== null ||
    !!currentStatus?.pending ||
    currentIntent !== null;
  const zone =
    timeZone === "WIB"
      ? "Asia/Jakarta"
      : timeZone === "WIT"
        ? "Asia/Jayapura"
        : "Asia/Makassar";
  const seen = currentStatus?.lastSeenAt
    ? `${new Intl.DateTimeFormat("id-ID", {
        timeZone: zone,
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(currentStatus.lastSeenAt))} ${timeZone}`
    : "Belum ada";

  return (
    <section
      className="mb-5 rounded-xl border border-emerald-900/10 bg-surface p-4 shadow-sm"
      aria-label="Kontrol jarak jauh LISTEN"
    >
      <h2 className="text-base font-semibold text-ink">
        Kontrol jarak jauh LISTEN
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-[#f0f7f2] p-3">
          <p className="text-xs text-muted">Monitoring otomatis</p>
          <p className="mt-1 font-semibold text-ink">
            {confirmed === null || confirmed === undefined
              ? "Belum diketahui"
              : !communicating
                ? `Terakhir: ${confirmed ? "Aktif" : "Dijeda"}`
                : confirmed
                  ? "Aktif"
                  : "Dijeda"}
          </p>
        </div>
        <div className="rounded-lg bg-[#f0f7f2] p-3">
          <p className="text-xs text-muted">Perintah</p>
          <p className="mt-1 font-semibold text-ink">
            {currentStatus?.pending || currentIntent
              ? "Menunggu ESP32"
              : "Tidak ada antrean"}
          </p>
        </div>
        <div className="rounded-lg bg-[#f0f7f2] p-3">
          <p className="text-xs text-muted">Komunikasi terakhir</p>
          <p className="mt-1 text-xs font-semibold text-ink">{seen}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1 text-xs font-medium text-muted">
          <span id="listen-interval-label" className="block">
            Interval rekaman
          </span>
          <div ref={intervalRootRef} className="relative mt-1">
            <button
              ref={intervalTriggerRef}
              type="button"
              aria-labelledby="listen-interval-label"
              aria-haspopup="menu"
              aria-expanded={intervalOpen}
              aria-controls={intervalOpen ? intervalMenuId : undefined}
              disabled={!deviceId || sending !== null}
              onClick={() => setIntervalOpen((open) => !open)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setIntervalOpen(true);
                  const i = INTERVALS.findIndex(
                    (item) => item.value === intervalSeconds,
                  );
                  const next =
                    event.key === "ArrowDown"
                      ? (i + 1) % INTERVALS.length
                      : (i - 1 + INTERVALS.length) % INTERVALS.length;
                  requestAnimationFrame(() =>
                    intervalOptionRefs.current[next]?.focus(),
                  );
                }
              }}
              className={`flex h-11 w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 text-left text-sm font-medium text-ink transition-colors hover:bg-[#f7faf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 disabled:cursor-not-allowed disabled:opacity-60 ${intervalOpen ? "border-emerald-600" : "border-line"}`}
            >
              <span>
                {INTERVALS.find((item) => item.value === intervalSeconds)
                  ?.label ?? `${intervalSeconds} detik`}
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`size-4 shrink-0 transition-transform ${intervalOpen ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {intervalOpen && (
              <div
                id={intervalMenuId}
                role="menu"
                aria-labelledby="listen-interval-label"
                className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-xl border border-line bg-white p-2 shadow-lg"
              >
                {INTERVALS.map((item, index) => {
                  const selected = item.value === intervalSeconds;
                  return (
                    <button
                      key={item.value}
                      ref={(element) => {
                        intervalOptionRefs.current[index] = element;
                      }}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => selectInterval(item.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "ArrowDown" ||
                          event.key === "ArrowUp"
                        ) {
                          event.preventDefault();
                          moveIntervalFocus(
                            index,
                            event.key === "ArrowDown" ? 1 : -1,
                          );
                        } else if (event.key === "Home") {
                          event.preventDefault();
                          intervalOptionRefs.current[0]?.focus();
                        } else if (event.key === "End") {
                          event.preventDefault();
                          intervalOptionRefs.current[
                            INTERVALS.length - 1
                          ]?.focus();
                        } else if (event.key === "Tab") {
                          setIntervalOpen(false);
                        }
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${selected ? "bg-[#edf5f0] font-semibold text-emerald-700" : "font-medium text-ink hover:bg-[#f5f8f6]"}`}
                    >
                      <span>{item.label}</span>
                      {selected && (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-4"
                        >
                          <path d="m5 12 4 4L19 6" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={locked || !intervalDirty}
          onClick={() => void dispatch("interval")}
          className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${intervalPending ? "border-amber-500 bg-amber-100 text-amber-900 ring-2 ring-amber-200" : "border-emerald-700 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}
        >
          {intervalPending ? "Menerapkan..." : "Terapkan interval"}
        </button>
        <button
          type="button"
          aria-pressed={activeStart}
          aria-label={
            activeStart
              ? "Jeda monitoring otomatis"
              : "Mulai monitoring otomatis"
          }
          title={activeStart ? "Jeda monitoring" : "Mulai monitoring"}
          disabled={locked}
          onClick={() => void dispatch(activeStart ? "pause" : "start")}
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 disabled:cursor-not-allowed disabled:opacity-60 ${
            startPending || pausePending
              ? "border-emerald-700 bg-emerald-50 text-emerald-800"
              : activeStart
                ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                : "border-emerald-700 bg-white text-emerald-800 hover:bg-emerald-50"
          }`}
        >
          {activeStart ? (
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M8 5.6c0-.8.9-1.3 1.6-.9l10.1 6.4c.7.4.7 1.4 0 1.8L9.6 19.3c-.7.4-1.6-.1-1.6-.9V5.6Z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={() => void fetchStatus()}
          disabled={!deviceId || sending !== null}
          aria-label="Segarkan status perangkat"
          title="Segarkan status"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink transition-colors duration-150 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 11a8 8 0 1 0-2.4 5.7" />
            <path d="M20 4v7h-7" />
          </svg>
        </button>
      </div>
      {(feedback || startPending || pausePending || intervalPending) && (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-sm font-medium text-emerald-800"
        >
          {feedback || "Menunggu konfirmasi ESP32..."}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-muted">
        Status tombol mengikuti konfirmasi ESP32. Jeda tidak menghapus WAV yang
        sudah menunggu unggahan.
      </p>
    </section>
  );
}
