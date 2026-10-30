"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { SidebarBrandImage } from "@/components/branding/SidebarBrandImage";
import { SidebarToggleIcon } from "@/components/ui/SidebarToggleIcon";
import { WorkspaceNotifications } from "@/components/workspace/WorkspaceNotifications";
import * as I from "@/figma-operator/components/icons";
import { useModalDrawerFocus } from "@/hooks/use-modal-drawer-focus";
import { useSidebarSwipeClose } from "@/hooks/use-sidebar-swipe-close";

const groups = [
  {
    title: "OPERASI",
    pages: [
      { href: "/supervisor/overview", label: "Ringkasan", icon: I.Grid },
      { href: "/supervisor/map", label: "Peta lingkungan", icon: I.Route },
      {
        href: "/supervisor/analytics",
        label: "Analitik operasional",
        icon: I.Grid,
      },
    ],
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

function SidebarBrand() {
  return (
    <div className="flex h-14 shrink-0 items-center px-4">
      <SidebarBrandImage />
    </div>
  );
}

function SidebarSections({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate?: () => void;
}) {
  return (
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
                    onClick={onNavigate}
                    className={`relative flex min-h-9 items-center gap-2.5 rounded-md px-3 text-[13px] font-medium transition-colors ${
                      active
                        ? "bg-brand-50 text-ink before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:bg-[#8fc9b2]"
                        : "text-muted hover:bg-bg hover:text-ink"
                    }`}
                  >
                    <Icon
                      className={`size-4 ${
                        active ? "text-[#8fc9b2]" : "text-muted"
                      }`}
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
  );
}

function SidebarIdentity({
  orgName,
  userName,
  onNavigate,
}: {
  orgName: string;
  userName: string;
  onNavigate?: () => void;
}) {
  return (
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
        <span className="min-w-0 block truncate font-medium">{userName}</span>
      </div>

      <Link
        href="/account/security"
        className="mt-2 flex h-9 items-center gap-2 rounded-md px-3 text-[13px] text-muted transition-colors hover:bg-bg hover:text-ink"
        onClick={onNavigate}
      >
        <I.Shield className="size-4" />
        Profil & Keamanan
      </Link>

      <div className="mt-3 rounded-md bg-bg p-1 [&_button]:w-full">
        <LogoutButton
          variant="sidebar"
          icon={<I.LogOut className="size-4 text-muted" />}
        />
      </div>
    </div>
  );
}

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
  const [sidebarHidden, setSidebarHidden] = useState(false);

  const closeDrawer = useCallback(() => setDrawer(false), []);
  const { triggerRef, dialogRef } = useModalDrawerFocus(drawer, closeDrawer);
  const mobileSwipe = useSidebarSwipeClose(closeDrawer);

  const currentLabel =
    groups
      .flatMap((group) => group.pages)
      .find((page) => path.startsWith(page.href))?.label ?? "Workspace";

  return (
    <div className="min-h-dvh bg-bg">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface transition-transform duration-300 ease-in-out motion-reduce:transition-none lg:flex ${
          sidebarHidden ? "-translate-x-full" : "translate-x-0"
        }`}
      >
        <div className="border-b border-line">
          <SidebarBrand />
        </div>

        <SidebarSections path={path} />
        <SidebarIdentity orgName={orgName} userName={userName} />
      </aside>

      <div
        ref={dialogRef}
        tabIndex={-1}
        data-wc024-mobile-navigation="true"
        inert={!drawer}
        aria-hidden={!drawer}
        className={`fixed inset-0 z-[60] lg:hidden transition-[visibility] duration-300 ease-in-out motion-reduce:transition-none ${
          drawer ? "visible" : "invisible pointer-events-none"
        }`}
        role="dialog"
        aria-modal={drawer ? "true" : undefined}
        aria-label="Navigasi Supervisor"
      >
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="Tutup navigasi"
          tabIndex={-1}
          className={`absolute inset-0 bg-ink/60 transition-opacity duration-300 ease-in-out motion-reduce:transition-none ${
            drawer ? "opacity-100" : "opacity-0"
          }`}
        />

        <aside
          {...mobileSwipe}
          className={`absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-line bg-surface transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
            drawer ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="relative h-14 shrink-0 border-b border-line pr-14">
            <SidebarBrand />
            <button
              type="button"
              aria-label="Tutup navigasi Supervisor"
              data-wc014-dialog-close
              onClick={closeDrawer}
              className="absolute top-2.5 right-3 grid size-9 place-items-center rounded-md border border-line bg-surface text-fg/80 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand"
            >
              <I.X className="size-5" />
            </button>
          </div>

          <SidebarSections path={path} onNavigate={() => setDrawer(false)} />
          <SidebarIdentity
            orgName={orgName}
            userName={userName}
            onNavigate={() => setDrawer(false)}
          />
        </aside>
      </div>

      <div
        className={`transition-[padding] duration-300 ease-in-out motion-reduce:transition-none ${
          sidebarHidden ? "lg:pl-0" : "lg:pl-[248px]"
        }`}
      >
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
          <button
            type="button"
            ref={triggerRef}
            aria-label={
              drawer ? "Tutup navigasi Supervisor" : "Buka navigasi Supervisor"
            }
            aria-expanded={drawer}
            onClick={() => setDrawer((open) => !open)}
            className="rounded-md border border-line p-2 text-ink lg:hidden"
          >
            <SidebarToggleIcon open={drawer} />
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
            <SidebarToggleIcon open={!sidebarHidden} />
          </button>

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1 text-[13px]">
            <ol className="flex min-w-0 items-center gap-1.5 text-muted">
              <li className="shrink-0">Supervisor</li>
              <li aria-hidden="true">/</li>
              <li className="truncate font-semibold text-fg">{currentLabel}</li>
            </ol>
          </nav>
          <WorkspaceNotifications workspaceRole="supervisor" />
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 pb-16 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
