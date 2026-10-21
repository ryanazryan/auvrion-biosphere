"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import * as I from "@/figma-operator/components/icons";
import { Wordmark } from "@/figma-operator/components/ui";

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
  useEffect(() => {
    if (!drawer) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [drawer]);
  const nav = (
    <>
      <div className="border-b border-white/10 px-4 pb-4 pt-4">
        <span className="text-white">
          <Wordmark inverted />
        </span>
        <p className="mt-2 text-xs text-white/55">Ruang kerja supervisor</p>
      </div>
      <nav
        aria-label="Navigasi supervisor"
        className="flex-1 space-y-5 overflow-y-auto px-3 py-5"
      >
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-[11px] font-bold tracking-[0.09em] text-white/45">
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
                      className={`relative flex min-h-10 items-center gap-2.5 rounded-md px-3 text-[13px] font-medium transition-colors ${active ? "bg-white/10 text-white before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:bg-[#8fc9b2]" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
                    >
                      <Icon
                        className={`size-4 ${active ? "text-[#8fc9b2]" : "text-white/50"}`}
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
      <div className="border-t border-white/10 p-3">
        <div className="rounded-md bg-white/5 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-white/50">
            Organisasi
          </p>
          <p className="truncate text-[13px] text-white">{orgName}</p>
        </div>
        <div className="mt-3 flex items-center gap-2 px-1 text-[13px] text-white">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/15 font-semibold">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{userName}</span>
            <span className="text-xs text-white/55">Supervisor</span>
          </span>
        </div>
        <div className="mt-3 rounded-md bg-white/5 p-1 [&_button]:w-full [&_button]:text-white/80">
          <LogoutButton variant="sidebar" />
        </div>
      </div>
    </>
  );
  return (
    <div className="min-h-dvh bg-bg">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-ink lg:flex">
        {nav}
      </aside>
      {drawer && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigasi Supervisor"
        >
          <button
            type="button"
            onClick={() => setDrawer(false)}
            aria-label="Tutup navigasi"
            className="absolute inset-0 bg-ink/60"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-ink">
            <div className="flex h-12 shrink-0 items-center justify-end border-b border-white/10 px-3">
              <button
                type="button"
                aria-label="Tutup navigasi Supervisor"
                onClick={() => setDrawer(false)}
                className="grid size-9 place-items-center rounded-md text-white/80 hover:bg-white/10 focus-visible:outline-offset-2"
              >
                <I.X className="size-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
          <button
            type="button"
            aria-label="Buka navigasi Supervisor"
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
            className="rounded-md border border-line p-2 text-ink lg:hidden"
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
