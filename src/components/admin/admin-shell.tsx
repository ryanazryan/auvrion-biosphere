"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import {
  AuvrionMark,
  BellIcon,
  CloseIcon,
  GearIcon,
  GridIcon,
  InboxIcon,
  LogoutIcon,
  MenuIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/admin/admin-icons";
import { authClient } from "@/lib/auth-client";

const NAV_ITEMS = [
  { label: "Ringkasan", icon: GridIcon, soon: true },
  {
    label: "Permohonan Akses",
    icon: InboxIcon,
    href: "/admin/access-applications",
  },
  {
    label: "Pengguna & Hak Akses",
    icon: UsersIcon,
    href: "/admin/access-users",
  },
  { label: "Keamanan", icon: ShieldIcon, href: "/account/security" },
  { label: "Pengaturan", icon: GearIcon, soon: true },
] as const;

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap text-white">
      <AuvrionMark className="shrink-0" />

      {!collapsed && (
        <span className="text-[15px] font-semibold tracking-[-0.01em]">
          Auvrion <span className="font-normal text-white/70">Biosphere</span>
        </span>
      )}
    </div>
  );
}

function SignOutAction({
  collapsed,
  insideMenu = false,
}: {
  collapsed?: boolean;
  insideMenu?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    if (loading) return;

    setLoading(true);
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
      setLoading(false);
    }
  }

  if (insideMenu) {
    return (
      <>
        <button
          type="button"
          role="menuitem"
          onClick={signOut}
          disabled={loading}
          className="block w-full rounded-md px-2.5 py-2 text-left text-[13px] text-danger hover:bg-danger-50 disabled:opacity-50"
        >
          {loading ? "Sedang keluar..." : "Logout"}
        </button>

        {error && (
          <p role="alert" className="px-2.5 py-1 text-xs text-danger">
            Gagal logout. Coba lagi.
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={signOut}
        title={collapsed ? "Logout" : undefined}
        aria-label="Logout"
        className={`mt-2.5 flex h-9 w-full items-center gap-2 rounded-md px-3 text-[13px] text-white/70 hover:bg-white/8 hover:text-white disabled:opacity-50 ${
          collapsed ? "lg:justify-center lg:px-0" : ""
        }`}
      >
        <LogoutIcon className="size-4 shrink-0" />

        <span className={collapsed ? "lg:sr-only" : ""}>
          {loading ? "Sedang keluar..." : "Logout"}
        </span>
      </button>

      {error && (
        <p role="alert" className="mt-1 text-xs text-[#ffc9c9]">
          Logout gagal.
        </p>
      )}
    </>
  );
}

function Navigation({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi administrasi"
      className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;

        const active = "href" in item && item.href === pathname;

        const itemClass = `flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-[13px] [&_svg]:size-4.5 [&_svg]:shrink-0 ${
          collapsed ? "lg:justify-center lg:px-0" : ""
        }`;

        const contents = (
          <>
            <Icon />

            <span className={collapsed ? "lg:sr-only" : ""}>{item.label}</span>

            {"soon" in item && item.soon && (
              <span
                className={`ml-auto rounded bg-white/10 px-1.5 py-px text-[10px] text-white/60 ${
                  collapsed ? "lg:hidden" : ""
                }`}
              >
                Segera
              </span>
            )}
          </>
        );

        if ("href" in item && item.href) {
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
              className={`${itemClass} ${
                active
                  ? "bg-white/12 font-medium text-white"
                  : "text-white/70 hover:bg-white/8 hover:text-white"
              }`}
            >
              {contents}
            </Link>
          );
        }

        return (
          <span
            key={item.label}
            aria-disabled="true"
            title={collapsed ? `${item.label} (segera)` : undefined}
            className={`${itemClass} cursor-not-allowed text-white/40`}
          >
            {contents}
          </span>
        );
      })}
    </nav>
  );
}

function ProfileBlock({
  collapsed,
  organizationName,
  adminEmail,
}: {
  collapsed: boolean;
  organizationName: string;
  adminEmail: string;
}) {
  return (
    <div className="border-t border-white/10 p-3">
      <div
        className={`flex items-center gap-2.5 ${
          collapsed ? "lg:justify-center" : ""
        }`}
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/12 text-xs font-semibold text-white"
        >
          AC
        </span>

        <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
          <p className="truncate text-[13px] font-medium text-white">
            Administrator
          </p>

          <p className="truncate text-xs text-white/60" title={adminEmail}>
            {organizationName}
          </p>
        </div>
      </div>

      <SignOutAction collapsed={collapsed} />
    </div>
  );
}

/**
 * Auvrion Biosphere Admin Shell.
 *
 * UI adapted from the approved Figma Make prototype.
 * Authentication and authorization remain enforced on the server.
 */
export function AdminShell({
  children,
  organizationName,
  adminEmail,
}: {
  children: ReactNode;
  organizationName: string;
  adminEmail: string;
}) {
  const pathname = usePathname();
  const currentPageLabel =
    pathname === "/admin/access-users"
      ? "Pengguna & Hak Akses"
      : "Permohonan Akses";

  const [collapsed, setCollapsed] = useState(false);
  // AB-UI-SIDEBAR-SLIDE-20261022: desktop sidebar translates as a whole.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen && !profileOpen) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setProfileOpen(false);
      }
    };

    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [mobileOpen, profileOpen]);

  return (
    <div className="min-h-dvh bg-bg font-sans text-fg antialiased">
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink transition-transform duration-300 ease-in-out motion-reduce:transition-none lg:flex ${
          collapsed ? "-translate-x-full" : "translate-x-0"
        }`}
      >
        <div className="flex h-14 items-center border-b border-white/10 px-4">
          <Brand />
        </div>

        <Navigation collapsed={false} />

        <ProfileBlock
          collapsed={false}
          organizationName={organizationName}
          adminEmail={adminEmail}
        />
      </aside>

      {/* Mobile navigation */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigasi administrasi"
        >
          <button
            type="button"
            aria-label="Tutup navigasi"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-ink/50"
          />

          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-ink">
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
              <Brand />

              <button
                type="button"
                aria-label="Tutup navigasi"
                onClick={() => setMobileOpen(false)}
                className="grid size-9 place-items-center rounded-md text-white/80 hover:bg-white/8"
              >
                <CloseIcon className="size-5" />
              </button>
            </div>

            <Navigation
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />

            <ProfileBlock
              collapsed={false}
              organizationName={organizationName}
              adminEmail={adminEmail}
            />
          </aside>
        </div>
      )}

      {/* Main application area */}
      <div
        className={`transition-[padding] duration-300 ease-in-out motion-reduce:transition-none ${
          collapsed ? "lg:pl-0" : "lg:pl-64"
        }`}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-line bg-white">
          <div className="flex h-14 items-center gap-2 px-3 min-[360px]:px-4 sm:px-6">
            {/* Mobile menu toggle */}
            <button
              type="button"
              aria-label="Buka navigasi"
              onClick={() => setMobileOpen(true)}
              className="grid size-9 place-items-center rounded-md text-muted hover:bg-bg lg:hidden"
            >
              <MenuIcon className="size-5" />
            </button>

            {/* Desktop sidebar toggle */}
            <button
              type="button"
              aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
              aria-pressed={!collapsed}
              onClick={() => setCollapsed((v) => !v)}
              className="hidden size-9 place-items-center rounded-md text-muted hover:bg-bg lg:grid"
            >
              <MenuIcon className="size-5" />
            </button>

            {/* Breadcrumb */}
            <nav
              aria-label="Breadcrumb"
              className="min-w-0 flex-1 truncate text-[13px] text-muted"
            >
              Administration <span aria-hidden="true">/</span>{" "}
              <span aria-current="page" className="font-medium text-fg">
                {currentPageLabel}
              </span>
            </nav>

            {/* Organization */}
            <span className="hidden rounded-md border border-line px-2.5 py-1 text-xs text-muted sm:inline-block">
              <span className="sr-only">Organisasi: </span>
              {organizationName}
            </span>

            {/* Notification icon */}
            <span
              title="Notifikasi"
              className="grid size-9 shrink-0 place-items-center text-muted"
            >
              <BellIcon className="size-4.5" />

              <span className="sr-only">Tidak ada notifikasi baru</span>
            </span>

            {/* Profile menu */}
            <div className="relative">
              <button
                type="button"
                aria-label="Menu profil admin"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                onClick={() => setProfileOpen((v) => !v)}
                className="grid size-9 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand hover:bg-[#e4f0e9]"
              >
                AC
              </button>

              {profileOpen && (
                <>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Tutup menu profil"
                    onClick={() => setProfileOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />

                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-line bg-white p-1.5 shadow-[0_8px_24px_-8px_rgb(20_45_37/0.25)]"
                  >
                    <div className="px-2.5 py-2">
                      <p className="text-[13px] font-medium">Administrator</p>

                      <p
                        className="truncate text-xs text-muted"
                        title={adminEmail}
                      >
                        {organizationName}
                      </p>
                    </div>

                    <Link
                      role="menuitem"
                      href="/account/security"
                      onClick={() => setProfileOpen(false)}
                      className="block rounded-md px-2.5 py-2 text-[13px] hover:bg-bg"
                    >
                      Keamanan akun
                    </Link>

                    <SignOutAction insideMenu />
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Development environment notice */}
        <div className="border-b border-warn/30 bg-warn-50">
          <p className="px-4 py-2 text-xs leading-5 text-warn min-[360px]:px-5 sm:px-6">
            Workspace development dengan data PostgreSQL lokal. Tindakan
            administratif memerlukan izin server dan sesi MFA yang sah.
          </p>
        </div>

        {/* Page content */}
        <main className="mx-auto max-w-6xl px-4 pt-6 pb-24 min-[360px]:px-5 sm:px-6 sm:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
