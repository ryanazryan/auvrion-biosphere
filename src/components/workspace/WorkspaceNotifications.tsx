"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "@/figma-operator/components/icons";

type Role = "operator" | "supervisor" | "ranger";
type Event = {
  key: string;
  title: string;
  href: string;
  at: string;
  read: boolean;
};

export function WorkspaceNotifications({
  workspaceRole,
}: {
  workspaceRole: Role;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Event[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const url = `/api/workspace/notifications?role=${workspaceRole}`;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(url, {
          credentials: "same-origin",
          cache: "no-store",
          signal,
        });
        if (!response.ok) throw new Error("NOTIFICATIONS_UNAVAILABLE");
        const data: unknown = await response.json();
        if (
          !data ||
          typeof data !== "object" ||
          !("items" in data) ||
          !Array.isArray(data.items)
        ) {
          throw new Error("INVALID_RESPONSE");
        }
        if (!signal?.aborted) {
          setItems(data.items as Event[]);
          setError(false);
          setReady(true);
        }
      } catch {
        if (!signal?.aborted) {
          setError(true);
          setReady(true);
        }
      }
    },
    [url],
  );

  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(abort.signal);
    }, 30000);
    return () => {
      window.clearInterval(timer);
      abort.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setConfirmClear(false);
      }
    };
    const onKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirmClear(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKeyboard);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKeyboard);
    };
  }, [open]);

  const unread = items.filter((item) => !item.read).length;

  async function markRead(keys: string[]) {
    if (!keys.length || busy) return;
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      if (!response.ok) throw new Error("MARK_READ_FAILED");
      const changed = new Set(keys);
      setItems((current) =>
        current.map((item) =>
          changed.has(item.key) ? { ...item, read: true } : item,
        ),
      );
      setError(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (busy || !ready || error) return;
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      if (!response.ok) throw new Error("CLEAR_FAILED");
      setItems([]);
      setConfirmClear(false);
      setError(false);
      // The cursor lives on the server; subsequent polling shows only newer events.
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        title="Notifikasi"
        aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ""}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setConfirmClear(false);
        }}
        className="relative grid size-9 place-items-center rounded-lg text-muted transition hover:bg-brand-50 hover:text-brand"
      >
        <Bell className="size-4.5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          className="absolute right-0 z-[70] mt-2 w-[min(370px,calc(100vw-24px))] overflow-hidden rounded-xl border border-line bg-white shadow-xl"
          aria-label="Notifikasi"
        >
          <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Notifikasi</h2>
            <div className="flex items-center gap-3">
              {unread > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  className="text-xs font-semibold text-emerald-800 hover:underline disabled:opacity-60"
                  onClick={() =>
                    void markRead(
                      items
                        .filter((item) => !item.read)
                        .map((item) => item.key),
                    )
                  }
                >
                  Tandai dibaca
                </button>
              )}
              {ready && !error && items.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmClear(true)}
                  className="text-xs font-semibold text-slate-700 hover:underline disabled:opacity-60"
                >
                  Bersihkan
                </button>
              )}
            </div>
          </header>
          {confirmClear && (
            <div className="border-b border-line bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-ink">
                Sembunyikan semua notifikasi saat ini?
              </p>
              <p className="mt-1 text-xs text-muted">
                Rekaman dan riwayat Case tetap tersimpan.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmClear(false)}
                  className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void clearAll()}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Membersihkan..." : "Bersihkan semua"}
                </button>
              </div>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="border-b border-line px-4 py-2 text-xs text-danger"
            >
              Gagal memperbarui notifikasi.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void load()}
              >
                Coba lagi
              </button>
            </p>
          )}
          {!ready && (
            <p role="status" className="p-5 text-sm text-muted">
              Memuat...
            </p>
          )}
          {ready && !error && items.length === 0 && (
            <p className="p-6 text-center text-sm text-muted">
              Belum ada notifikasi baru.
            </p>
          )}
          <ul className="max-h-80 divide-y divide-line overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.key}
                className={item.read ? "bg-white" : "bg-[#f0f8f4]"}
              >
                <Link
                  href={item.href}
                  onClick={() => {
                    void markRead([item.key]);
                    setOpen(false);
                  }}
                  className="block px-4 py-3 hover:bg-brand-50"
                >
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  <time
                    dateTime={item.at}
                    className="mt-1 block text-xs text-muted"
                  >
                    {new Intl.DateTimeFormat("id-ID", {
                      timeZone: "Asia/Makassar",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(item.at))}{" "}
                    WITA
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
