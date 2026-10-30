"use client";

import { useEffect, useState } from "react";

type Zone = "WIB" | "WITA" | "WIT";
const zoneNames: Record<Zone, string> = {
  WIB: "Asia/Jakarta",
  WITA: "Asia/Makassar",
  WIT: "Asia/Jayapura",
};

export function OperatorLiveClock({ timeZone }: { timeZone: Zone }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  const label = now
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: zoneNames[timeZone],
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now)
    : "--:--:--";
  return (
    <time
      className="tabular-nums font-mono text-sm font-semibold tracking-wide text-fg"
      dateTime={now?.toISOString()}
    >
      {label} {timeZone}
    </time>
  );
}
