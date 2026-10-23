"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { RangerIcon } from "./RangerIcons";

const NAV = [
  { href: "/ranger", label: "Beranda", short: "Beranda", icon: "home" },
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

function activePath(path: string, href: string) {
  if (href === "/ranger") return path === href;
  if (href === "/ranger/tasks")
    return (
      path.startsWith(href) &&
      !path.includes("/findings/") &&
      !path.endsWith("/history")
    );
  if (href === "/ranger/findings")
    return path.startsWith(href) || path.includes("/findings/");
  return path.startsWith(href) || path.endsWith("/history");
}

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
        className={`flex min-h-9 items-center gap-2 rounded-md px-2 text-[13px] transition-colors disabled:opacity-50 ${compact ? "text-fg hover:bg-bg" : "text-muted hover:bg-brand-50 hover:text-ink"}`}
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
      className={mobile ? "grid grid-cols-4" : "flex-1 px-2.5 py-5"}
    >
      {NAV.map((item) => {
        const active = activePath(path, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              mobile
                ? `relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${active ? "text-brand" : "text-muted hover:text-fg"}`
                : `relative mb-1 flex h-10 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors ${active ? "bg-white/12 text-ink before:absolute before:inset-y-2 before:-left-2.5 before:w-[3px] before:rounded-r before:bg-[#85cbb2]" : "text-muted hover:bg-white/8 hover:text-ink"}`
            }
          >
            {mobile && active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-brand"
              />
            )}
            <RangerIcon
              name={Icon}
              className={mobile ? "size-5" : "size-4 shrink-0 text-ink/60"}
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
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0))
    .join("")
    .toUpperCase();
  const breadcrumb =
    NAV.find((n) => activePath(path, n.href))?.label ?? "Tugas Saya";

  // AB-UI-SIDEBAR-SLIDE-20261022
  const [sidebarHidden, setSidebarHidden] = useState(false);
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-surface text-ink lg:flex transition-transform duration-300 ease-in-out motion-reduce:transition-none ${sidebarHidden ? "-translate-x-full" : "translate-x-0"}`}
      >
        <Link
          href="/ranger"
          className="flex items-center gap-2.5 border-b border-line px-4 py-5"
          aria-label="Auvrion Biosphere, beranda Ranger"
        >
          <RangerIcon name="brand" className="size-7 text-ink" />
          <span className="text-[15px] font-semibold tracking-tight">
            Auvrion <span className="font-normal text-ink/65">Biosphere</span>
          </span>
        </Link>
        <p className="px-4 pt-2 text-xs text-muted">
          Ruang kerja lapangan · ranger
        </p>
        <Navigation path={path} />
        <div className="border-t border-line px-3 py-3">
          <div className="rounded-md bg-bg px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Organisasi
            </p>
            <p className="mt-1 truncate text-[13px] text-ink/85" title={org}>
              {org}
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2.5 px-1">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-[#a9dfce]">
              {initials || "R"}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">
                {name}
              </span>
              <span className="block text-xs text-muted">Ranger</span>
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <a
              href="/account/security"
              className="flex min-h-9 min-w-0 items-center gap-2 px-2 text-xs text-muted hover:text-ink"
            >
              <RangerIcon name="shield" className="size-4 shrink-0" />
              <span className="truncate">Profil & Keamanan</span>
            </a>
            <SignOut />
          </div>
        </div>
      </aside>

      <div
        className={` transition-[padding] duration-300 ease-in-out motion-reduce:transition-none ${sidebarHidden ? "lg:pl-0" : "lg:pl-[248px]"}`}
      >
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-line bg-white/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
          <button
            type="button"
            aria-label={
              sidebarHidden ? "Buka sidebar Ranger" : "Tutup sidebar Ranger"
            }
            aria-pressed={!sidebarHidden}
            title={sidebarHidden ? "Buka sidebar" : "Tutup sidebar"}
            onClick={() => setSidebarHidden((hidden) => !hidden)}
            className="hidden size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg focus-visible:outline-2 focus-visible:outline-brand lg:inline-flex"
          >
            <span aria-hidden="true" className="flex flex-col gap-1">
              <span className="block h-px w-4 bg-current" />
              <span className="block h-px w-4 bg-current" />
              <span className="block h-px w-4 bg-current" />
            </span>
          </button>

          <nav
            aria-label="Jejak navigasi"
            className="flex min-w-0 items-center gap-2 text-[13px]"
          >
            <Link href="/ranger" className="text-muted hover:text-brand">
              Ranger
            </Link>
            <RangerIcon name="chevron" className="size-3 text-muted/55" />
            <span aria-current="page" className="truncate font-medium text-fg">
              {breadcrumb}
            </span>
          </nav>
          <div className="relative lg:hidden">
            <button
              type="button"
              aria-expanded={accountOpen}
              aria-label="Menu akun"
              aria-controls="ranger-account-menu"
              onClick={() => setAccountOpen((v) => !v)}
              className="grid size-9 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand ring-1 ring-brand/10"
            >
              {initials || "R"}
            </button>
            {accountOpen && (
              <div
                id="ranger-account-menu"
                className="absolute right-0 z-30 mt-2 w-64 origin-top-right rounded-lg border border-line bg-white p-3 shadow-xl motion-safe:animate-[ranger-pop_160ms_ease-out]"
              >
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="mb-2 truncate text-xs text-muted">
                  {org} · Ranger
                </p>
                <a
                  href="/account/security"
                  className="block rounded-md px-2 py-2 text-[13px] text-brand hover:bg-brand-50"
                >
                  Profil & Keamanan
                </a>
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
        <main className="mx-auto max-w-[1080px] px-4 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-8 lg:pb-12">
          {children}
        </main>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <Navigation path={path} mobile />
      </div>
    </div>
  );
}
