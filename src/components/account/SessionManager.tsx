"use client";

import { useCallback, useEffect, useState } from "react";

type SessionInfo = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  current: boolean;
};

function describeBrowser(agent: string | null): string {
  if (!agent) return "Browser tidak diketahui";
  if (/Edg\//.test(agent)) return "Microsoft Edge";
  if (/Firefox\//.test(agent)) return "Firefox";
  if (/OPR\//.test(agent)) return "Opera";
  if (/Chrome\//.test(agent)) return "Chrome / Chromium";
  if (/Safari\//.test(agent)) return "Safari";
  return "Browser tidak diketahui";
}
function describePlatform(agent: string | null): string {
  if (!agent) return "Perangkat tidak diketahui";
  if (/Android/.test(agent)) return "Android";
  if (/iPhone|iPad/.test(agent)) return "iOS / iPadOS";
  if (/Windows/.test(agent)) return "Windows";
  if (/Macintosh|Mac OS X/.test(agent)) return "macOS";
  if (/Linux/.test(agent)) return "Linux";
  return "Perangkat tidak diketahui";
}
function displayDate(value: string): string {
  const when = new Date(value);
  return Number.isNaN(when.getTime())
    ? "Waktu tidak tersedia"
    : `${when.toLocaleString("id-ID", { timeZone: "Asia/Makassar", dateStyle: "medium", timeStyle: "short" })} WITA`;
}

export function SessionManager() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/account/sessions", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("SESSION_LIST_UNAVAILABLE");
      const result = (await response.json()) as { sessions?: SessionInfo[] };
      setSessions(result.sessions ?? []);
      setState("ready");
    } catch {
      setState("error");
      setError(
        "Daftar sesi belum dapat dimuat. Login ulang jika verifikasi MFA berakhir.",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function revoke(sessionId: string) {
    setError("");
    setBusyId(sessionId);
    try {
      const response = await fetch("/api/account/sessions", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        if (result.error === "RECENT_MFA_REQUIRED") {
          throw new Error(
            "Untuk mengeluarkan perangkat lain, login ulang menggunakan TOTP agar verifikasi keamanan masih baru (5 menit). ",
          );
        }
        throw new Error(
          "Sesi tidak berhasil dicabut. Periksa koneksi dan coba kembali.",
        );
      }
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Gagal mencabut sesi.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="border-t border-line px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink">
            Perangkat yang login
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-md border border-line px-3 py-2 text-xs font-semibold text-brand hover:bg-bg"
        >
          Segarkan
        </button>
      </div>
      {state === "loading" && (
        <p role="status" className="text-sm text-muted">
          Memuat sesi...
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {state === "ready" &&
        (sessions.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada sesi aktif yang dapat ditampilkan.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink">
                    {describeBrowser(session.userAgent)} ·{" "}
                    {describePlatform(session.userAgent)}
                    {session.current ? " · Sesi ini" : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Login: {displayDate(session.createdAt)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    IP: {session.ipAddress ?? "Tidak tersedia"} · Kedaluwarsa:{" "}
                    {displayDate(session.expiresAt)}
                  </p>
                </div>
                {!session.current && (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void revoke(session.id)}
                    className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 hover:bg-red-50"
                  >
                    {busyId === session.id ? "Memproses..." : "Keluarkan sesi"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
      {error && state === "ready" && (
        <p role="alert" className="mt-3 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
