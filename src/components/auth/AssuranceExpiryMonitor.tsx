"use client";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Never signs out accounts whose MFA was never completed (enrollment state). */
export function AssuranceExpiryMonitor() {
  const busy = useRef(false);
  const expired = useRef(false);
  const [failure, setFailure] = useState(false);
  useEffect(() => {
    let disposed = false;
    async function check() {
      if (disposed || busy.current || expired.current) return;
      busy.current = true;
      try {
        const res = await fetch("/api/auth/assurance-status", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const value = (await res.json()) as {
          authenticated?: boolean;
          reauthRequired?: boolean;
        };
        if (!value.authenticated || !value.reauthRequired) return;
        expired.current = true;
        const out = await authClient.signOut();
        if (out.error) throw new Error("SIGNOUT_FAILED");
        if (!disposed) window.location.replace("/login?reason=mfa-expired");
      } catch {
        if (expired.current && !disposed) setFailure(true);
      } finally {
        busy.current = false;
      }
    }
    void check();
    const id = window.setInterval(() => void check(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  if (!failure) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="reauth-heading"
      className="fixed inset-0 z-[9999] grid place-items-center bg-black/65 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 text-ink shadow-xl">
        <h2 id="reauth-heading" className="font-semibold">
          Verifikasi keamanan berakhir
        </h2>
        <p className="mt-2 text-sm">
          Logout otomatis belum berhasil. Akses operasional tetap ditolak. Coba
          keluar kembali.
        </p>
        <button
          className="mt-4 rounded-md bg-brand px-4 py-2 text-sm text-white"
          type="button"
          onClick={async () => {
            const r = await authClient.signOut();
            if (!r.error) window.location.replace("/login?reason=mfa-expired");
          }}
        >
          Keluar dan masuk ulang
        </button>
      </div>
    </div>
  );
}
