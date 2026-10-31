"use client";

import Image from "next/image";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { AdminNotificationBell } from "@/components/admin/AdminNotificationBell";
import { CloseIcon, LogoutIcon } from "@/components/admin/admin-icons";
import { AdminSidebarNavigation } from "@/components/admin/admin-sidebar-navigation";
import { SidebarToggleIcon } from "@/components/ui/SidebarToggleIcon";
import { useModalDrawerFocus } from "@/hooks/use-modal-drawer-focus";
import { useSidebarSwipeClose } from "@/hooks/use-sidebar-swipe-close";
import { authClient } from "@/lib/auth-client";

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Image
      src={
        collapsed
          ? "/branding/auvrion-biosphere-mark.png"
          : "/branding/auvrion-biosphere-sidebar-logo.png"
      }
      alt="Auvrion Biosphere"
      width={collapsed ? 44 : 196}
      height={52}
      className={
        collapsed
          ? "size-9 object-contain"
          : "h-8 w-auto max-w-36.5 object-contain"
      }
    />
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
        className={`mt-2.5 flex h-9 w-full items-center gap-2 rounded-md px-3 text-[13px] text-[#64766a] hover:bg-[#eef5ef] hover:text-[#145f48] disabled:opacity-50 ${
          collapsed ? "lg:justify-center lg:px-0" : ""
        }`}
      >
        <LogoutIcon className="size-4 shrink-0" />

        <span className={collapsed ? "lg:sr-only" : ""}>
          {loading ? "Sedang keluar..." : "Logout"}
        </span>
      </button>

      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          Logout gagal.
        </p>
      )}
    </>
  );
}

function ProfileBlock({
  collapsed,
  organizationName,
  adminEmail,
  demo = false,
}: {
  collapsed: boolean;
  organizationName: string;
  adminEmail: string;
  demo?: boolean;
}) {
  return (
    <div className="border-t border-[#e3ebe5] p-3">
      <div className="rounded-xl border border-[#e5ece6] bg-[#f6f9f7] px-3 py-3">
        <p className="text-[10px] font-medium text-[#819186]">
          Organisasi saat ini
        </p>
        <p
          className="mt-0.5 truncate text-xs font-semibold text-[#263c2e]"
          title={organizationName}
        >
          {organizationName}
        </p>
      </div>
      <Link
        href={demo ? "/demo/admin/security" : "/account/security"}
        className="mt-2 flex min-h-9 items-center rounded-lg px-3 text-[13px] text-[#64766a] hover:bg-[#eef5ef] hover:text-[#145f48]"
      >
        Profil & Keamanan
      </Link>
      <span className="sr-only">Administrator: {adminEmail}</span>
      {demo ? (
        <Link
          href="/"
          className="mt-2.5 flex h-9 items-center px-3 text-[13px] text-[#145f48]"
        >
          Keluar dari Demo
        </Link>
      ) : (
        <SignOutAction collapsed={collapsed} />
      )}
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
  demo = false,
}: {
  children: ReactNode;
  organizationName: string;
  adminEmail: string;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const originalAdminPageLabel =
    pathname === "/admin/access-users"
      ? "Pengguna & Hak Akses"
      : pathname === "/admin/map"
        ? "Peta Lokasi"
        : "Permohonan Akses";
  const currentPageLabel = demo
    ? pathname.endsWith("/access-users")
      ? "Pengguna & Hak Akses"
      : pathname.endsWith("/devices")
        ? "Perangkat IoT"
        : pathname.endsWith("/map")
          ? "Peta lingkungan"
          : pathname.endsWith("/security")
            ? "Keamanan"
            : "Permohonan Akses"
    : pathname === "/admin/devices"
      ? "Perangkat IoT"
      : pathname === "/admin/map"
        ? "Peta lingkungan"
        : originalAdminPageLabel;

  const [collapsed, setCollapsed] = useState(false);
  // AB-UI-SIDEBAR-SLIDE-20261022: desktop sidebar translates as a whole.
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const { triggerRef, dialogRef } = useModalDrawerFocus(
    mobileOpen,
    closeMobile,
  );
  const mobileSwipe = useSidebarSwipeClose(() => setMobileOpen(false));
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
        className={`fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#e4ece5] bg-white transition-transform duration-300 ease-in-out motion-reduce:transition-none lg:flex ${
          collapsed ? "-translate-x-full" : "translate-x-0"
        }`}
      >
        <div className="flex h-14 items-center border-b border-[#e5ece6] px-4">
          <Brand />
        </div>

        <AdminSidebarNavigation demo={demo} />

        <ProfileBlock
          collapsed={false}
          organizationName={organizationName}
          adminEmail={adminEmail}
          demo={demo}
        />
      </aside>

      {/* Mobile navigation */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        data-wc024-mobile-navigation="true"
        inert={!mobileOpen}
        aria-hidden={!mobileOpen}
        className={`fixed inset-0 z-60 lg:hidden transition-[visibility] duration-300 ease-in-out motion-reduce:transition-none ${mobileOpen ? "visible" : "invisible pointer-events-none"}`}
        role="dialog"
        aria-modal={mobileOpen ? "true" : undefined}
        aria-label="Navigasi administrasi"
      >
        <button
          type="button"
          aria-label="Tutup navigasi"
          onClick={() => setMobileOpen(false)}
          className={`absolute inset-0 bg-ink/50 transition-opacity duration-300 ease-in-out motion-reduce:transition-none ${mobileOpen ? "opacity-100" : "opacity-0"}`}
        />

        <aside
          {...mobileSwipe}
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white transition-transform duration-300 ease-in-out motion-reduce:transition-none ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="relative flex h-14 items-center justify-between border-b border-[#e5ece6] px-4 pr-14">
            <Brand />

            <button
              type="button"
              aria-label="Tutup navigasi"
              onClick={() => setMobileOpen(false)}
              data-wc014-dialog-close
              className="absolute top-2 right-3 z-10 grid size-9 place-items-center rounded-md border border-[#dde8e0] bg-white text-[#64766a] transition-colors hover:bg-[#eef5ef] focus-visible:outline-2 focus-visible:outline-white"
            >
              <CloseIcon className="size-5" />
            </button>
          </div>

          <AdminSidebarNavigation
            demo={demo}
            onNavigate={() => setMobileOpen(false)}
          />

          <ProfileBlock
            collapsed={false}
            organizationName={organizationName}
            adminEmail={adminEmail}
            demo={demo}
          />
        </aside>
      </div>

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
              ref={triggerRef}
              aria-label={mobileOpen ? "Tutup navigasi" : "Buka navigasi"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
              className="grid size-9 place-items-center rounded-md text-muted/70 hover:bg-bg lg:hidden"
            >
              <SidebarToggleIcon open={mobileOpen} />
            </button>

            {/* Desktop sidebar toggle */}
            <button
              type="button"
              aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
              aria-pressed={!collapsed}
              onClick={() => setCollapsed((v) => !v)}
              className="hidden size-9 place-items-center rounded-md text-muted hover:bg-bg lg:grid"
            >
              <SidebarToggleIcon open={!collapsed} />
            </button>

            {/* Breadcrumb */}
            <nav
              aria-label="Breadcrumb"
              className="min-w-0 flex-1 truncate text-[13px] text-muted"
            >
              Admin <span aria-hidden="true">/</span>{" "}
              <span aria-current="page" className="font-medium text-fg">
                {currentPageLabel}
              </span>
            </nav>

            {/* Organization */}
            <span className="hidden rounded-md border border-line px-2.5 py-1 text-xs text-muted sm:inline-block">
              <span className="sr-only">Organisasi: </span>
              {organizationName}
            </span>

            {/* Admin notifications: accessible and backed by the existing endpoint. */}
            <AdminNotificationBell demo={demo} />

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
                      href={demo ? "/demo/admin/security" : "/account/security"}
                      onClick={() => setProfileOpen(false)}
                      className="block rounded-md px-2.5 py-2 text-[13px] hover:bg-bg"
                    >
                      Keamanan akun
                    </Link>

                    {demo ? (
                      <Link
                        role="menuitem"
                        href="/"
                        className="block rounded-md px-2.5 py-2 text-[13px] hover:bg-bg"
                      >
                        Keluar Demo
                      </Link>
                    ) : (
                      <SignOutAction insideMenu />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto max-w-[1480px] px-4 pt-6 pb-24 min-[360px]:px-5 sm:px-6 sm:pt-8">
          {demo && (
            <div
              role="status"
              className="mb-5 rounded-lg border border-[#b6dfc5] bg-[#edf8f0] px-4 py-3 text-sm font-medium text-[#075b43]"
            >
              MODE SIMULASI ADMIN — data sintetis, tidak mengubah database,
              akun, atau perangkat nyata.
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
