"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BellIcon, CloseIcon } from "@/components/admin/admin-icons";

type NotificationResponse = { pending?: number; error?: string };

/** Same org-scoped, MFA-gated summary endpoint as DeviceAdminFrame. */
export function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await fetch("/api/admin/device-notifications", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!result.ok) throw new Error(`HTTP ${result.status}`);
        const data = (await result.json()) as NotificationResponse;
        if (!controller.signal.aborted) {
          setPending(typeof data.pending === "number" ? data.pending : null);
        }
      } catch {
        if (!controller.signal.aborted) {
          setPending(null);
          setError("Ringkasan tidak tersedia. Periksa izin Admin dan MFA.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [open]);

  return (
    <div ref={wrapper} className="relative shrink-0">
      <button
        type="button"
        aria-label="Buka notifikasi Admin"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <BellIcon className="size-4.5" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notifikasi administrasi"
          className="absolute right-0 top-full z-40 mt-2 w-[min(330px,85vw)] rounded-xl border border-line bg-white p-4 text-fg shadow-lg"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Notifikasi Admin</h2>
            <button
              type="button"
              aria-label="Tutup notifikasi"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted hover:bg-bg"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
          <p className="mt-3 text-sm" role="status">
            {loading
              ? "Memuat notifikasi…"
              : error || pending === null
                ? error || "Ringkasan notifikasi belum tersedia."
                : pending === 0
                  ? "Tidak ada permohonan baru yang menunggu peninjauan."
                  : `${pending} permohonan akses memerlukan tinjauan.`}
          </p>
          <Link
            href="/admin/access-applications"
            onClick={() => setOpen(false)}
            className="mt-4 block rounded-md border border-line px-3 py-2 text-center text-xs font-semibold text-brand hover:bg-bg"
          >
            Lihat permohonan akses
          </Link>
        </div>
      )}
    </div>
  );
}
