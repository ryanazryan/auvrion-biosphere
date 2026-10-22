"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { OperatorAssistControls } from "@/figma-operator/demo/OperatorAssistant";
import { useOperator } from "../../operator-context";
import * as I from "../icons";
import { Wordmark } from "../ui";

type Item = {
  href: string;
  label: string;
  icon: ReactNode;
  active: (p: string) => boolean;
};
const NAV: Item[] = [
  {
    href: "/operator/overview",
    label: "Ringkasan",
    icon: <I.Grid />,
    active: (p) => p === "/operator/overview",
  },
  {
    href: "/operator/observations",
    label: "Observasi",
    icon: <I.List />,
    active: (p) =>
      p.startsWith("/operator/observations") &&
      p !== "/operator/observations/new",
  },
  {
    href: "/operator/map",
    label: "Peta Observasi",
    icon: <I.MapPin />,
    active: (p) => p === "/operator/map",
  },
  {
    href: "/operator/observations/new",
    label: "Catat Observasi",
    icon: <I.Plus />,
    active: (p) => p === "/operator/observations/new",
  },
  {
    href: "/operator/review",
    label: "Antrean Review",
    icon: <I.Inbox />,
    active: (p) => p.startsWith("/operator/review"),
  },
  {
    href: "/operator/handoffs",
    label: "Pelacakan Handoff",
    icon: <I.Route />,
    active: (p) => p.startsWith("/operator/handoffs"),
  },
];
function Nav({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  const row =
    "relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium [&_svg]:size-4 [&_svg]:shrink-0";
  return (
    <nav
      aria-label="Navigasi operator"
      className="flex-1 overflow-y-auto px-2.5 py-3"
    >
      <ul className="space-y-0.5">
        {NAV.map((n) => {
          const on = n.active(path);
          return (
            <li key={n.label}>
              <a
                href={n.href}
                onClick={onNavigate}
                aria-current={on ? "page" : undefined}
                className={`${row} ${on ? "bg-brand-50 text-ink before:absolute before:inset-y-1.5 before:left-0 before:w-0.75 before:rounded-full before:bg-brand [&_svg]:text-brand" : "text-fg/80 hover:bg-bg hover:text-fg [&_svg]:text-muted"}`}
              >
                {n.icon}
                {n.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Identity() {
  const { operator: OPERATOR } = useOperator();
  return (
    <div className="border-t border-line p-2.5">
      <div className="flex items-center gap-2.5 px-1.5 py-1.5">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-bg text-xs font-semibold text-ink"
        >
          {OPERATOR.initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{OPERATOR.name}</p>
          <p className="truncate text-xs text-muted">
            Operator · {OPERATOR.orgName}
          </p>
        </div>
      </div>
      <a
        href="/account/security"
        className="mt-1 flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] text-muted hover:bg-bg hover:text-fg"
      >
        <I.Shield className="size-4" />
        Keamanan akun
      </a>
      <LogoutButton
        variant="sidebar"
        icon={<I.LogOut className="size-4 text-muted" />}
      />
    </div>
  );
}

// AB-UI-OPERATOR-TIMEZONE-MAPLAYOUT-20261022
const DISPLAY_ZONES = [
  { id: "WIB", offset: "UTC+7", name: "Indonesia Barat" },
  { id: "WITA", offset: "UTC+8", name: "Indonesia Tengah" },
  { id: "WIT", offset: "UTC+9", name: "Indonesia Timur" },
] as const;

type DisplayZone = (typeof DISPLAY_ZONES)[number]["id"];

/** Custom timezone control with the same visual language as Operator GIS filters. */
function OperatorTimeZoneMenu({
  timeZone,
  setTimeZone,
}: {
  timeZone: DisplayZone;
  setTimeZone: (zone: DisplayZone) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open]);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-label={`Zona waktu tampilan: ${timeZone}`}
        aria-expanded={open}
        aria-controls={listId}
        title="Pilih zona waktu tampilan"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-white px-2.5 text-xs font-semibold text-fg transition-colors hover:border-brand/50 hover:bg-brand-50/30 focus-visible:outline-2 focus-visible:outline-brand"
      >
        <I.Clock className="size-4 text-brand" />
        <span>{timeZone}</span>
        <I.Chevron
          className={`size-3.5 text-muted transition-transform duration-150 ${open ? "-rotate-90" : "rotate-90"}`}
        />
      </button>
      {open && (
        <fieldset
          id={listId}
          aria-label="Pilihan zona waktu tampilan"
          className="absolute top-full right-0 z-50 mt-2 w-68 max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-white p-1.5 text-[13px] shadow-lg"
        >
          <p className="px-2.5 py-1.5 text-xs font-medium text-muted">
            Zona waktu tampilan
          </p>
          {DISPLAY_ZONES.map((zone) => (
            <button
              key={zone.id}
              data-zone-option
              type="button"
              aria-pressed={timeZone === zone.id}
              onClick={() => {
                setTimeZone(zone.id);
                setOpen(false);
                trigger.current?.focus();
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-brand ${timeZone === zone.id ? "bg-brand-50 font-semibold text-brand" : "text-fg hover:bg-bg"}`}
            >
              <span className="w-9 shrink-0">{zone.id}</span>
              <span className="min-w-0 flex-1 whitespace-nowrap text-[11px] font-normal text-muted">
                {zone.name} · {zone.offset}
              </span>
              {timeZone === zone.id && (
                <I.Check className="size-4 shrink-0 text-brand" />
              )}
            </button>
          ))}
        </fieldset>
      )}
    </div>
  );
}

export type Crumb = { label: string; href?: string };

const Brand = () => (
  <div className="flex h-14 items-center gap-2 px-4">
    <Wordmark />
  </div>
);

/** Authenticated Operator workspace shell; no admin/supervisor/ranger navigation. */
export function OperatorLayout({
  path,
  crumbs,
  children,
  workspace = false,
}: {
  path: string;
  crumbs: Crumb[];
  children: ReactNode;
  workspace?: boolean;
}) {
  const { operator: OPERATOR, timeZone, setTimeZone } = useOperator();
  const [drawer, setDrawer] = useState(false);
  // AB-UI-SIDEBAR-SLIDE-20261022: hide the entire desktop sidebar, preserving all links.
  const [sidebarHidden, setSidebarHidden] = useState(false);
  useEffect(() => {
    if (!drawer) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [drawer]);
  return (
    <div className="min-h-dvh bg-bg">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface pt-(--safe-top) pl-(--safe-left) transition-transform duration-300 ease-in-out motion-reduce:transition-none lg:flex ${sidebarHidden ? "-translate-x-full" : "translate-x-0"}`}
      >
        <div className="border-b border-line">
          <Brand />
        </div>
        <Nav path={path} />
        <Identity />
      </aside>

      {drawer && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigasi operator"
        >
          <button
            type="button"
            aria-label="Tutup navigasi"
            onClick={() => setDrawer(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface pt-(--safe-top) pl-(--safe-left)">
            <div className="flex items-center border-b border-line pr-2">
              <div className="min-w-0 flex-1">
                <Brand />
              </div>
              <button
                type="button"
                aria-label="Tutup navigasi"
                onClick={() => setDrawer(false)}
                className="grid size-9 place-items-center rounded-md text-muted hover:bg-bg"
              >
                <I.X className="size-5" />
              </button>
            </div>
            <Nav path={path} onNavigate={() => setDrawer(false)} />
            <Identity />
          </div>
        </div>
      )}

      <div
        className={`transition-[padding] duration-300 ease-in-out motion-reduce:transition-none ${sidebarHidden ? "lg:pl-0" : "lg:pl-60"}`}
      >
        <header className="sticky top-0 z-50 border-b border-line bg-surface pt-(--safe-top) pr-(--safe-right) pl-(--safe-left) lg:pl-0">
          <div className="flex h-14 items-center gap-2 px-3 min-[360px]:px-4 sm:px-6">
            <button
              type="button"
              aria-label="Buka navigasi"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
              className="grid size-9 place-items-center rounded-md text-muted hover:bg-bg lg:hidden"
            >
              <I.Menu className="size-5" />
            </button>
            <button
              type="button"
              aria-label={
                sidebarHidden
                  ? "Buka sidebar Operator"
                  : "Tutup sidebar Operator"
              }
              aria-pressed={!sidebarHidden}
              title={sidebarHidden ? "Buka sidebar" : "Tutup sidebar"}
              onClick={() => setSidebarHidden((hidden) => !hidden)}
              className="hidden size-9 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-brand lg:grid"
            >
              <I.Menu className="size-5" />
            </button>
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                <li className="hidden shrink-0 sm:block">Operator</li>
                {crumbs.map((c, i) => {
                  const last = i === crumbs.length - 1;
                  return (
                    <li
                      key={c.label}
                      className={`flex min-w-0 items-center gap-1.5 ${last ? "" : "max-sm:hidden"}`}
                    >
                      <span aria-hidden="true" className="max-sm:hidden">
                        /
                      </span>
                      {last || !c.href ? (
                        <span
                          aria-current={last ? "page" : undefined}
                          className={`truncate ${last ? "font-medium text-fg" : ""}`}
                        >
                          {c.label}
                        </span>
                      ) : (
                        <a
                          href={c.href}
                          className="truncate rounded hover:text-fg"
                        >
                          {c.label}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>

            <OperatorTimeZoneMenu
              timeZone={timeZone}
              setTimeZone={setTimeZone}
            />
            {path === "/operator/observations/demo-listen-01" && (
              <span className="hidden shrink-0 items-center gap-1 rounded border border-dashed border-warn/50 px-1.5 py-0.5 text-xs font-medium text-warn sm:inline-flex">
                <I.Shield className="size-3" />
                Data simulasi
              </span>
            )}
            <OperatorAssistControls />
            <span className="hidden max-w-56 truncate border-l border-line pl-3 text-[13px] text-muted md:inline">
              <span className="sr-only">Organisasi: </span>
              {OPERATOR.orgName}
            </span>
            <span
              role="img"
              aria-label={`${OPERATOR.name}, operator`}
              className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-bg text-xs font-semibold text-ink lg:hidden"
            >
              {OPERATOR.initials}
            </span>
          </div>
        </header>
        <div className="pr-(--safe-right) pl-(--safe-left) lg:pl-0">
          <main
            className={
              workspace
                ? "flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden bg-surface"
                : "mx-auto max-w-295 px-4 pt-6 min-[360px]:px-5 pb-[calc(7rem+var(--safe-bottom))] sm:px-6 sm:pt-7"
            }
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
