"use client";

import { useMemo, useState } from "react";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { RangerIcon } from "./RangerIcons";
import {
  ACTIONABLE,
  type RangerTaskItem,
  TaskList,
  taskZone,
} from "./RangerViews";

type View = "active" | "waiting" | "done" | "all";
const VIEWS: { key: View; label: string }[] = [
  { key: "active", label: "Perlu tindakan" },
  { key: "waiting", label: "Menunggu evaluasi" },
  { key: "done", label: "Selesai & dibatalkan" },
  { key: "all", label: "Semua" },
];
function inView(view: View, task: RangerTaskItem) {
  return (
    view === "all" ||
    (view === "active"
      ? ACTIONABLE.includes(task.status)
      : view === "waiting"
        ? task.status === "submitted"
        : task.status === "completed" || task.status === "cancelled")
  );
}
export function RangerTaskBoard({ tasks }: { tasks: RangerTaskItem[] }) {
  const [view, setView] = useState<View>("active");
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState("");
  const [sort, setSort] = useState("field");
  const zones = useMemo(
    () =>
      [
        ...new Set(
          tasks
            .map((t) => taskZone(t.instructions))
            .filter((v): v is string => Boolean(v)),
        ),
      ].sort(),
    [tasks],
  );
  const base = useMemo(
    () =>
      tasks.filter((task) => {
        const term = query.trim().toLowerCase();
        return (
          (!term || `${task.id} ${task.title}`.toLowerCase().includes(term)) &&
          (!zone || taskZone(task.instructions) === zone)
        );
      }),
    [tasks, query, zone],
  );
  const filtered = useMemo(
    () =>
      base
        .filter((t) => inView(view, t))
        .sort((a, b) =>
          sort === "recent"
            ? new Date(b.assignedAt).getTime() -
              new Date(a.assignedAt).getTime()
            : a.status.localeCompare(b.status) ||
              new Date(b.assignedAt).getTime() -
                new Date(a.assignedAt).getTime(),
        ),
    [base, sort, view],
  );
  return (
    <div>
      <fieldset className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-line p-1">
        <legend className="sr-only">Tampilan tugas</legend>
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            aria-pressed={view === v.key}
            className={`min-h-9 rounded-md px-3 text-[12px] transition-colors sm:text-[13px] ${view === v.key ? "bg-white font-semibold text-ink shadow-sm ring-1 ring-line" : "text-muted hover:bg-white/70"}`}
          >
            {v.label}
            <span className="ml-1.5 tabular-nums text-brand">
              {base.filter((t) => inView(v.key, t)).length}
            </span>
          </button>
        ))}
      </fieldset>
      <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(130px,190px)_minmax(130px,160px)]">
        <div className="block min-w-0 text-xs text-muted">
          Cari tugas
          <span className="relative mt-1 block">
            <RangerIcon
              name="search"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ID atau judul tugas"
              className="h-10 w-full min-w-0 rounded-md border border-line-strong bg-white pr-3 pl-9 text-[13px] text-fg outline-none focus:border-brand"
            />
          </span>
        </div>
        <div className="block min-w-0 text-xs text-muted">
          Zona
          <SelectMenu
            label="Filter zona"
            value={zone}
            className="mt-1"
            options={[
              { value: "", label: "Semua zona saya" },
              ...zones.map((z) => ({ value: z, label: z })),
            ]}
            onChange={setZone}
          />
        </div>
        <div className="block min-w-0 text-xs text-muted">
          Urutkan
          <SelectMenu
            label="Urutan tugas"
            value={sort}
            className="mt-1"
            options={[
              { value: "field", label: "Urutan lapangan" },
              { value: "recent", label: "Terbaru" },
            ]}
            onChange={setSort}
          />
        </div>
      </div>
      <p role="status" className="sr-only">
        {filtered.length} tugas ditampilkan
      </p>
      {filtered.length ? (
        <TaskList tasks={filtered} />
      ) : (
        <div className="rounded-lg border border-line bg-white p-8 text-center text-[13px] text-muted">
          {tasks.length
            ? "Tidak ada tugas yang cocok."
            : "Belum ada tugas untuk Anda."}
        </div>
      )}
    </div>
  );
}
