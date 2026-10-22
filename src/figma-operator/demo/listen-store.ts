"use client";

import { useSyncExternalStore } from "react";

/** UI-only synthetic preview. No API/DB writes and no real inference. */
export type ListenStep =
  | "idle"
  | "recording"
  | "received"
  | "processing"
  | "candidate"
  | "notified";
export type ListenNotice = {
  id: number;
  label: string;
  at: string;
  level: "info" | "warn";
};
type ListenState = {
  step: ListenStep;
  notices: ListenNotice[];
  unread: number;
};
const EMPTY: ListenState = { step: "idle", notices: [], unread: 0 };
let current: ListenState = EMPTY;
const listeners = new Set<() => void>();
let pending: ReturnType<typeof setTimeout>[] = [];
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const publish = (change: Partial<ListenState>) => {
  current = { ...current, ...change };
  for (const listener of listeners) listener();
};
export function useListenPreview() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => EMPTY,
  );
}
export function markListenRead() {
  publish({ unread: 0 });
}
export function resetListenPreview() {
  for (const timer of pending) clearTimeout(timer);
  pending = [];
  publish({ step: "idle", notices: [], unread: 0 });
}
function addNotice(label: string, level: ListenNotice["level"] = "info") {
  const id = current.notices.length + 1;
  publish({
    notices: [
      {
        id,
        label,
        level,
        at: new Intl.DateTimeFormat("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Makassar",
        }).format(new Date()),
      },
      ...current.notices,
    ],
    unread: current.unread + 1,
  });
}
export function startListenPreview() {
  resetListenPreview();
  publish({ step: "recording" });
  pending.push(
    setTimeout(() => {
      publish({ step: "received" });
      addNotice("Rekaman diterima");
    }, 1200),
  );
  pending.push(setTimeout(() => publish({ step: "processing" }), 2700));
  pending.push(
    setTimeout(() => {
      publish({ step: "candidate" });
      addNotice("Analisis selesai");
    }, 4300),
  );
  pending.push(
    setTimeout(() => {
      publish({ step: "notified" });
      addNotice("Pola audio perlu ditinjau", "warn");
    }, 5700),
  );
}
export function listenHasAudio(step: ListenStep) {
  return (
    step === "received" ||
    step === "processing" ||
    step === "candidate" ||
    step === "notified"
  );
}
export const listenSteps = [
  "Perangkat merekam",
  "Audio diterima",
  "Analisis AI",
  "Kandidat tersedia",
  "Operator diberi tahu",
] as const;
export function listenProgress(step: ListenStep): number {
  return (
    {
      idle: 0,
      recording: 1,
      received: 2,
      processing: 3,
      candidate: 4,
      notified: 5,
    } as const
  )[step];
}
export const LISTEN_DEMO_ROUTE = "/operator/observations/demo-listen-01";
