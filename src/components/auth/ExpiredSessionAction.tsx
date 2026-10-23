"use client";
import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
export function ExpiredSessionAction() {
  const [failed, setFailed] = useState(false);
  const leave = useCallback(async () => {
    setFailed(false);
    try {
      const r = await authClient.signOut();
      if (r.error) throw new Error("SIGNOUT_FAILED");
      window.location.replace("/login?reason=mfa-expired");
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void leave();
  }, [leave]);
  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => void leave()}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
      >
        Masuk ulang
      </button>
      {failed && (
        <p role="alert" className="mt-2 text-xs text-danger">
          Gagal mengakhiri sesi. Ulangi tindakan.
        </p>
      )}
    </div>
  );
}
