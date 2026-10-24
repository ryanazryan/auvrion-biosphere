"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import * as I from "@/figma-operator/components/icons";
import { Wordmark } from "@/figma-operator/components/ui";
import { useModalDrawerFocus } from "@/hooks/use-modal-drawer-focus";

const groups = [
  {
    title: "OPERASI",
    pages: [{ href: "/supervisor/overview", label: "Ringkasan", icon: I.Grid }],
  },
  {
    title: "KEPUTUSAN",
    pages: [
      {
        href: "/supervisor/decisions",
        label: "Antrean keputusan",
        icon: I.Inbox,
      },
      { href: "/supervisor/outcomes", label: "Hasil kasus", icon: I.Check },
    ],
  },
  {
    title: "LAPANGAN",
    pages: [
      {
        href: "/supervisor/assignments",
        label: "Penugasan ranger",
        icon: I.UserPlus,
      },
      { href: "/supervisor/tasks", label: "Tugas ranger", icon: I.Route },
    ],
  },
];

export function SupervisorShell({
  children,
  orgName,
  userName,
}: {
  children: ReactNode;
  orgName: string;
  userName: string;
}) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  // AB-UI-SIDEBAR-SLIDE-20261022
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const { triggerRef, dialogRef } = useModalDrawerFocus(drawer, closeDrawer);
  const nav = (
    <>
      <div className="border-b border-line px-4 pb-4 pt-4">
        <span className="text-ink">
          <Wordmark />
        </span>
        <p className="mt-2 text-xs text-muted">Ruang kerja supervisor</p>
      </div>
      <nav
        aria-label="Navigasi supervisor"
        className="flex-1 space-y-5 overflow-y-auto px-3 py-4"
      >
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-[11px] font-bold tracking-[0.09em] text-muted">
              {group.title}
            </p>
            <ul className="space-y-1">
              {group.pages.map(({ href, label, icon: Icon }) => {
                const active = path === href || path.startsWith(`${href}/`);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setDrawer(false)}
                      className={`relative flex min-h-9 items-center gap-2.5 rounded-md px-3 text-[13px] font-medium transition-colors ${active ? "bg-brand-50 text-ink before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:bg-[#8fc9b2]" : "text-muted hover:bg-bg hover:text-ink"}`}
                    >
                      <Icon
                        className={`size-4 ${active ? "text-[#8fc9b2]" : "text-muted"}`}
                      />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <div className="rounded-md bg-bg px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-muted">
            Organisasi
          </p>
          <p className="truncate text-[13px] text-ink">{orgName}</p>
        </div>
        <div className="mt-3 flex items-center gap-2 px-1 text-[13px] text-ink">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 font-semibold">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{userName}</span>
            <span className="text-xs text-muted">Supervisor</span>
          </span>
        </div>
        <Link
          href="/account/security"
          className="mt-2 flex h-9 items-center gap-2 rounded-md px-3 text-[13px] text-muted transition-colors hover:bg-white/8 hover:text-ink"
          onClick={() => setDrawer(false)}
        >
          <I.Shield className="size-4" /> Profil & Keamanan
        </Link>
        <div className="mt-3 rounded-md bg-bg p-1 [&_button]:w-full ">
          <LogoutButton
            variant="sidebar"
            icon={<I.LogOut className="size-4 text-muted" />}
          />
        </div>
      </div>
    </>
  );
  return (
    <div className="min-h-dvh bg-bg">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-surface transition-transform duration-300 ease-in-out motion-reduce:transition-none lg:flex ${sidebarHidden ? "-translate-x-full" : "translate-x-0"}`}
      >
        {nav}
      </aside>
      {drawer && (
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigasi Supervisor"
        >
          <button
            type="button"
            onClick={() => setDrawer(false)}
            aria-label="Tutup navigasi"
            tabIndex={-1}
            className="absolute inset-0 bg-ink/60"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-surface">
            <div className="flex h-12 shrink-0 items-center justify-end border-b border-line px-3">
              <button
                type="button"
                aria-label="Tutup navigasi Supervisor"
                data-wc014-dialog-close
                onClick={closeDrawer}
                className="grid size-9 place-items-center rounded-md text-fg/80 hover:bg-brand-50 focus-visible:outline-offset-2"
              >
                <I.X className="size-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
      <div
        className={`transition-[padding] duration-300 ease-in-out motion-reduce:transition-none ${sidebarHidden ? "lg:pl-0" : "lg:pl-[248px]"}`}
      >
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
          <button
            type="button"
            ref={triggerRef}
            aria-label="Buka navigasi Supervisor"
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
            className="rounded-md border border-line p-2 text-ink lg:hidden"
          >
            <I.Menu className="size-5" />
          </button>
          <button
            type="button"
            aria-label={
              sidebarHidden
                ? "Buka sidebar Supervisor"
                : "Tutup sidebar Supervisor"
            }
            aria-pressed={!sidebarHidden}
            title={sidebarHidden ? "Buka sidebar" : "Tutup sidebar"}
            onClick={() => setSidebarHidden((hidden) => !hidden)}
            className="hidden size-9 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-brand lg:grid"
          >
            <I.Menu className="size-5" />
          </button>
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
            Supervisor /{" "}
            {groups
              .flatMap((group) => group.pages)
              .find((page) => path.startsWith(page.href))?.label ?? "Workspace"}
          </p>
          <span className="hidden rounded-full border border-brand/20 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand sm:inline-flex">
            Akses tervalidasi server
          </span>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 pb-16 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
