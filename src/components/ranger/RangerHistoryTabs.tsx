"use client";

import Link from "next/link";
import { useState } from "react";
import { RangerIcon } from "./RangerIcons";

export type RangerHistoryEvent = {
  id: string;
  taskId: string;
  title: string;
  at: string;
  actor: "mine" | "supervisor";
  detail: string;
};
const TABS = [
  { id: "all", label: "Semua" },
  { id: "mine", label: "Tindakan saya" },
  { id: "supervisor", label: "Supervisor" },
] as const;
type Filter = (typeof TABS)[number]["id"];
const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Makassar",
  }).format(new Date(iso));
const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Makassar",
  }).format(new Date(iso));
export function RangerHistoryTabs({
  events,
}: {
  events: RangerHistoryEvent[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const sorted = [...events]
    .filter((e) => filter === "all" || e.actor === filter)
    .sort((a, b) => b.at.localeCompare(a.at));
  const byDate = new Map<string, RangerHistoryEvent[]>();
  for (const event of sorted) {
    const label = dateLabel(event.at);
    byDate.set(label, [...(byDate.get(label) ?? []), event]);
  }
  return (
    <>
      <fieldset className="mb-5 flex flex-wrap gap-1 rounded-md border border-line p-1">
        <legend className="sr-only">Filter riwayat</legend>
        {TABS.map((tab) => {
          const count = events.filter(
            (e) => tab.id === "all" || e.actor === tab.id,
          ).length;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={`rounded-md px-3 py-2 text-[13px] transition-colors ${filter === tab.id ? "bg-white font-medium text-ink shadow-sm ring-1 ring-line" : "text-muted hover:bg-bg"}`}
            >
              {tab.label}{" "}
              <span className="ml-1 tabular-nums text-brand">{count}</span>
            </button>
          );
        })}
      </fieldset>
      {sorted.length === 0 ? (
        <section className="rounded-lg border border-line bg-white px-4 py-12 text-center">
          <RangerIcon name="clock" className="mx-auto mb-3 size-7 text-muted" />
          <h2 className="text-sm font-medium">
            Belum ada riwayat{" "}
            {filter === "mine"
              ? "tindakan Ranger"
              : filter === "supervisor"
                ? "Supervisor"
                : "penugasan"}
          </h2>
        </section>
      ) : (
        <div className="space-y-4">
          {Array.from(byDate, ([day, entries]) => (
            <section
              key={day}
              aria-label={day}
              className="rounded-lg border border-line bg-white p-4"
            >
              <h2 className="mb-4 text-[13px] font-semibold">{day}</h2>
              <ol className="space-y-4 border-l border-line pl-4">
                {entries.map((e) => (
                  <li
                    key={e.id}
                    className="relative text-[13px] before:absolute before:-left-[22px] before:top-1 before:size-3 before:rounded-full before:border before:border-brand before:bg-white"
                  >
                    <Link
                      href={`/ranger/tasks/${e.taskId}`}
                      className="font-medium text-ink hover:text-brand"
                    >
                      {e.title}
                    </Link>
                    <p className="mt-1 text-muted">{e.detail}</p>
                    <p className="mt-1 text-xs text-muted">
                      {e.actor === "mine" ? "Ranger" : "Supervisor / penugasan"}{" "}
                      · {timeLabel(e.at)} WITA
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Riwayat ini terbatas pada penugasan aktif dan temuan tersimpan yang
        boleh diakses. Log seluruh transisi belum tersedia.
      </p>
    </>
  );
}
