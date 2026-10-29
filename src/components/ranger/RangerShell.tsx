"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { SidebarBrandImage } from "@/components/branding/SidebarBrandImage";
import { SidebarToggleIcon } from "@/components/ui/SidebarToggleIcon";
import { WorkspaceNotifications } from "@/components/workspace/WorkspaceNotifications";
import { authClient } from "@/lib/auth-client";
import { RangerIcon } from "./RangerIcons";
import { activeRangerNavPath } from "./ranger-nav-active";

const NAV = [
  { href: "/ranger", label: "Beranda", short: "Beranda", icon: "home" },
  {
    href: "/ranger/map",
    label: "Peta Lingkungan",
    short: "Peta",
    icon: "map-pin",
  },
  { href: "/ranger/tasks", label: "Tugas Saya", short: "Tugas", icon: "route" },
  {
    href: "/ranger/findings",
    label: "Temuan Lapangan",
    short: "Temuan",
    icon: "notebook",
  },
  {
    href: "/ranger/history",
    label: "Riwayat",
    short: "Riwayat",
    icon: "clock",
  },
] as const;

function SignOut({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const signOut = async () => {
    if (busy) return;

    setBusy(true);
    setError(false);

    try {
      const result = await authClient.signOut();

      if (result.error) {
        setError(true);
        return;
      }

      window.location.replace("/login");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className={`flex min-h-9 items-center gap-2 rounded-md px-2 text-[13px] transition-colors disabled:opacity-50 ${
          compact
            ? "text-fg hover:bg-bg"
            : "text-muted hover:bg-brand-50 hover:text-ink"
        }`}
      >
        <RangerIcon name="logout" className="size-4 shrink-0" />
        {busy ? "Keluar…" : "Keluar"}
      </button>

      {error && (
        <p
          role="alert"
          className={`px-2 text-xs ${compact ? "text-danger" : "text-red-200"}`}
        >
          Gagal keluar.
        </p>
      )}
    </div>
  );
}

function Navigation({
  path,
  mobile = false,
}: {
  path: string;
  mobile?: boolean;
}) {
  return (
    <nav
      aria-label={mobile ? "Navigasi Ranger seluler" : "Navigasi Ranger"}
      className={
        mobile ? "grid grid-cols-5" : "flex-1 overflow-y-auto px-2.5 py-3"
      }
    >
      {NAV.map((item) => {
        const active = activeRangerNavPath(path, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              mobile
                ? `relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${
                    active ? "text-brand" : "text-muted hover:text-fg"
                  }`
                : `relative mb-1 flex h-10 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand ${
                    active
                      ? "bg-brand-50 text-ink before:absolute before:inset-y-2 before:-left-2.5 before:w-[3px] before:rounded-r before:bg-brand"
                      : "text-fg/80 hover:bg-bg hover:text-fg"
                  }`
            }
          >
            {mobile && active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-brand"
              />
            )}

            <RangerIcon
              name={item.icon}
              className={
                mobile
                  ? "size-5"
                  : `size-4 shrink-0 ${active ? "text-brand" : "text-muted"}`
              }
            />

            <span className="truncate">{mobile ? item.short : item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function RangerShell({
  children,
  name,
  org,
}: {
  children: ReactNode;
  name: string;
  org: string;
}) {
  const path = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);

  const accountTrigger = useRef<HTMLButtonElement>(null);
  const accountPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAccountOpen(false);
        accountTrigger.current?.focus();
      }
    };

    const handlePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;

      if (
        !accountTrigger.current?.contains(event.target) &&
        !accountPanel.current?.contains(event.target)
      ) {
        setAccountOpen(false);
      }
    };

    document.addEventListener("keydown", handleKey);
    document.addEventListener("pointerdown", handlePointer);

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("pointerdown", handlePointer);
    };
  }, [accountOpen]);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0))
    .join("")
    .toUpperCase();

  const breadcrumb =
    NAV.find((item) => activeRangerNavPath(path, item.href))?.label ??
    "Tugas Saya";

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface transition-transform duration-300 ease-in-out motion-reduce:transition-none lg:flex ${
          sidebarHidden ? "-translate-x-full" : "translate-x-0"
        }`}
      >
        <Link
          href="/ranger"
          className="flex h-14 shrink-0 items-center border-b border-line px-4"
          aria-label="Auvrion Biosphere, beranda Ranger"
        >
          <SidebarBrandImage />
        </Link>

        <Navigation path={path} />

        <div className="border-t border-line p-3">
          <div className="rounded-md bg-bg px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-muted">
              Organisasi
            </p>
            <p className="truncate text-[13px] text-ink" title={org}>
              {org}
            </p>
          </div>

          <div className="mt-3 flex items-center gap-2 px-1 text-[13px] text-ink">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 font-semibold">
              {initials || "R"}
            </span>
            <span className="min-w-0 block truncate font-medium">{name}</span>
          </div>

          <div className="mt-2">
            <Link
              href="/account/security"
              className="flex h-9 items-center gap-2 rounded-md px-3 text-[13px] text-muted transition-colors hover:bg-bg hover:text-ink"
            >
              <RangerIcon name="shield" className="size-4 shrink-0" />
              <span className="truncate">Profil & Keamanan</span>
            </Link>
          </div>

          <div className="mt-3 rounded-md bg-bg p-1">
            <SignOut />
          </div>
        </div>
      </aside>

      <div
        className={`transition-[padding] duration-300 ease-in-out motion-reduce:transition-none ${
          sidebarHidden ? "lg:pl-0" : "lg:pl-[248px]"
        }`}
      >
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            aria-label={
              sidebarHidden ? "Buka sidebar Ranger" : "Tutup sidebar Ranger"
            }
            aria-pressed={!sidebarHidden}
            title={sidebarHidden ? "Buka sidebar" : "Tutup sidebar"}
            onClick={() => setSidebarHidden((hidden) => !hidden)}
            className="hidden size-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-brand lg:inline-flex"
          >
            <SidebarToggleIcon open={!sidebarHidden} />
          </button>

          <nav
            aria-label="Jejak navigasi"
            className="flex min-w-0 flex-1 items-center gap-2 text-[13px]"
          >
            <Link href="/ranger" className="text-muted hover:text-brand">
              Ranger
            </Link>
            <RangerIcon name="chevron" className="size-3 text-muted/55" />
            <span
              aria-current="page"
              className="truncate font-semibold text-fg"
            >
              {breadcrumb}
            </span>
          </nav>

          <WorkspaceNotifications workspaceRole="ranger" />
          <div className="relative lg:hidden">
            <button
              type="button"
              aria-expanded={accountOpen}
              aria-label="Menu akun"
              ref={accountTrigger}
              aria-controls="ranger-account-menu"
              onClick={() => setAccountOpen((value) => !value)}
              className="grid size-9 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand ring-1 ring-brand/10"
            >
              {initials || "R"}
            </button>

            {accountOpen && (
              <div
                ref={accountPanel}
                id="ranger-account-menu"
                className="absolute right-0 z-30 mt-2 w-64 origin-top-right rounded-lg border border-line bg-white p-3 shadow-xl motion-safe:animate-[ranger-pop_160ms_ease-out]"
              >
                <p className="truncate text-sm font-semibold">{name}</p>

                <Link
                  href="/account/security"
                  className="mt-2 block rounded-md px-2 py-2 text-[13px] text-brand hover:bg-brand-50"
                >
                  Profil & Keamanan
                </Link>

                <SignOut compact />
              </div>
            )}
          </div>

          <span
            className="hidden truncate text-xs text-muted lg:inline"
            title={org}
          >
            {org}
          </span>
        </header>

        <main className="mx-auto max-w-270 px-4 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-8 lg:pb-12">
          {children}
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <Navigation path={path} mobile />
      </div>
    </div>
  );
}
