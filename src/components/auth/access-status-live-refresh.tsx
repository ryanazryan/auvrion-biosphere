"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type Props = { monitoring: boolean };

/** Refresh only when the server signals a real application lifecycle change. */
export function AccessStatusLiveRefresh({ monitoring }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!monitoring) return;

    // EventSource reconnects automatically after temporary network interruptions.
    // Database notifications are committed before the 'changed' event is pushed.
    const source = new EventSource("/api/access-applications/status/events");
    const refresh = () => router.refresh();

    // Catch any change between the server-rendered snapshot and subscribing.
    source.addEventListener("ready", refresh);
    source.addEventListener("changed", refresh);

    // Reconcile state after switching tabs, without periodic polling.
    function onVisibilityChange() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      source.close();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [monitoring, router]);

  if (!monitoring) return null;
  return (
    <p className="mt-5 text-xs leading-5 text-muted" role="status">
      Status permohonan akan diperbarui otomatis ketika administrator
      memprosesnya. Anda tidak perlu mengajukan permohonan baru.
    </p>
  );
}
