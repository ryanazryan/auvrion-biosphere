"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * AB-UI-STATUS-SYNC-20261023 — no new API, no local fake status.
 * Refreshes server-rendered status views when another role changes database state.
 * This is near-real-time polling, not an SSE/WebSocket push channel.
 */
const INTERVAL_MS = 8_000;
const MIN_REFRESH_GAP_MS = 5_000;

function isStatusWorkspace(pathname: string): boolean {
  return (
    pathname === "/request-access/status" ||
    pathname.startsWith("/request-access/status/") ||
    pathname === "/account/security" ||
    pathname.startsWith("/account/security/") ||
    pathname === "/operator" ||
    pathname.startsWith("/operator/") ||
    pathname === "/supervisor" ||
    pathname.startsWith("/supervisor/") ||
    pathname === "/ranger" ||
    pathname.startsWith("/ranger/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}

/** Avoid interrupting someone entering a reason, review, TOTP or finding. */
function userIsTyping(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return (
    el.matches("textarea, input, select") &&
    !el.matches(
      'input[type="hidden"], input[type="button"], input[type="submit"]',
    )
  );
}

export function StatusAutoRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (!isStatusWorkspace(pathname)) return;
    let active = true;
    const refresh = () => {
      if (!active || document.hidden || !navigator.onLine || userIsTyping())
        return;
      const now = Date.now();
      if (now - lastRefresh.current < MIN_REFRESH_GAP_MS) return;
      lastRefresh.current = now;
      router.refresh();
    };
    const timer = window.setInterval(refresh, INTERVAL_MS);
    const visibility = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [pathname, router]);

  return null;
}
