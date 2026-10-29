"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { SidebarToggleIcon } from "@/components/ui/SidebarToggleIcon";
import { authClient } from "@/lib/auth-client";

type GlyphName =
  | "map"
  | "chip"
  | "users"
  | "inbox"
  | "shield"
  | "bell"
  | "close"
  | "log-out";
type NavItem = { label: string; href: string; icon: GlyphName };
type NavGroup = { title: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    title: "OPERASI",
    items: [{ label: "Peta lingkungan", href: "/admin/map", icon: "map" }],
  },
  {
    title: "PERANGKAT",
    items: [{ label: "Perangkat IoT", href: "/admin/devices", icon: "chip" }],
  },
  {
    title: "ADMINISTRASI",
    items: [
      {
        label: "Permohonan Akses",
        href: "/admin/access-applications",
        icon: "inbox",
      },
      {
        label: "Pengguna & Hak Akses",
        href: "/admin/access-users",
        icon: "users",
      },
      { label: "Keamanan", href: "/account/security", icon: "shield" },
    ],
  },
];

function Glyph({
  kind,
  className = "",
}: {
  kind: GlyphName;
  className?: string;
}) {
  const paths: Record<GlyphName, ReactNode> = {
    map: (
      <>
        <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2z" />
        <path d="M9 3v16M15 5v16" />
      </>
    ),
    chip: (
      <>
        <rect x="5" y="5" width="14" height="14" rx="2" />
        <path d="M9 9h6v6H9zM9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87" />
        <circle cx="9" cy="7" r="4" />
      </>
    ),
    inbox: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 13h5l2 3h4l2-3h5" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />,
    close: <path d="m5 5 14 14M19 5 5 19" />,
    "log-out": (
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-5 shrink-0 ${className}`}
    >
      {paths[kind]}
    </svg>
  );
}

function AdminNavigation({
  mobile,
  organization,
  pathname,
  busy,
  onNavigate,
  onSignOut,
}: {
  mobile: boolean;
  organization: string;
  pathname: string;
  busy: boolean;
  onNavigate: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-[66px] shrink-0 items-center gap-2 border-b border-line px-5">
        <Image
          src="/branding/auvrion-biosphere-mark.png"
          alt=""
          width={38}
          height={38}
          className="size-[38px] object-contain"
        />
        <span className="text-[12px] font-extrabold uppercase leading-tight tracking-tight text-[#203c32]">
          Auvrion
          <span className="block text-[#238867]">Biosphere</span>
        </span>
        {mobile && (
          <button
            type="button"
            onClick={() => onNavigate()}
            aria-label="Tutup sidebar Admin"
            className="ml-auto grid size-9 place-items-center rounded-md text-muted hover:bg-bg"
          >
            <Glyph kind="close" />
          </button>
        )}
      </div>
      <nav
        aria-label="Menu administrasi"
        className="flex-1 space-y-6 overflow-y-auto px-3 py-6"
      >
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-[11px] font-bold tracking-[.12em] text-muted">
              {group.title}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const selected =
                  item.href === "/admin/devices"
                    ? pathname.startsWith("/admin/devices")
                    : pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => onNavigate()}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                      selected
                        ? "bg-[#e7f3ed] text-[#126447]"
                        : "text-[#596e66] hover:bg-bg hover:text-ink"
                    }`}
                  >
                    <Glyph kind={item.icon} className="size-[18px]" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <div className="rounded-lg bg-[#f4f8f5] px-3 py-3 text-xs text-[#60766b]">
          ORGANISASI
          <strong className="mt-1 block truncate text-[13px] text-[#193e2e]">
            {organization}
          </strong>
        </div>
        <Link
          href="/account/security"
          onClick={() => onNavigate()}
          className="mt-2 flex h-10 items-center rounded-md px-3 text-[13px] text-muted hover:bg-bg"
        >
          Profil & Keamanan
        </Link>
        <button
          type="button"
          onClick={() => onSignOut()}
          disabled={busy}
          className="flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-[13px] text-muted hover:bg-bg disabled:opacity-50"
        >
          <Glyph kind="log-out" className="size-4" />
          {busy ? "Keluar..." : "Logout"}
        </button>
      </div>
    </div>
  );
}

export function DeviceAdminFrame({
  children,
  pageName = "Perangkat IoT",
}: {
  children: ReactNode;
  pageName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [organization, setOrganization] = useState("Organisasi");
  const [busy, setBusy] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pendingApplications, setPendingApplications] = useState<number | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/device-fleet", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { organizationName?: string })
          : null,
      )
      .then((data) => {
        if (!controller.signal.aborted && data?.organizationName) {
          setOrganization(data.organizationName);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!mobileOpen && !notificationsOpen) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setNotificationsOpen(false);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileOpen, notificationsOpen]);

  async function toggleNotifications() {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    if (!nextOpen) return;
    try {
      const response = await fetch("/api/admin/device-notifications", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        setPendingApplications(null);
        return;
      }
      const data = (await response.json()) as { pending?: number };
      setPendingApplications(
        typeof data.pending === "number" ? data.pending : null,
      );
    } catch {
      setPendingApplications(null);
    }
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await authClient.signOut();
      if (response.error) throw new Error("SIGN_OUT_FAILED");
      router.replace("/login");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#f7f9f7] font-sans text-ink">
      <aside
        id="admin-desktop-navigation"
        aria-label="Sidebar Admin"
        aria-hidden={!desktopExpanded}
        inert={!desktopExpanded}
        className={`fixed inset-y-0 left-0 z-30 hidden w-[278px] border-r border-line transition-transform duration-300 ease-in-out motion-reduce:transition-none lg:block ${
          desktopExpanded ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <AdminNavigation
          mobile={false}
          organization={organization}
          pathname={pathname}
          busy={busy}
          onNavigate={() => setMobileOpen(false)}
          onSignOut={() => void signOut()}
        />
      </aside>
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigasi Admin"
          className="fixed inset-0 z-50 lg:hidden"
        >
          <button
            type="button"
            aria-label="Tutup navigasi"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 w-full bg-[#122d23]/40"
          />
          <aside className="relative h-full w-[min(288px,86vw)] border-r border-line shadow-xl">
            <AdminNavigation
              mobile={true}
              organization={organization}
              pathname={pathname}
              busy={busy}
              onNavigate={() => setMobileOpen(false)}
              onSignOut={() => void signOut()}
            />
          </aside>
        </div>
      )}
      <div
        className={`min-w-0 transition-[padding] duration-300 ease-in-out motion-reduce:transition-none ${
          desktopExpanded ? "lg:pl-[278px]" : "lg:pl-0"
        }`}
      >
        <header className="sticky top-0 z-20 flex h-[66px] items-center gap-3 border-b border-line bg-white px-4 sm:px-7">
          <button
            type="button"
            aria-label={
              mobileOpen ? "Tutup sidebar Admin" : "Buka sidebar Admin"
            }
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((previous) => !previous)}
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-bg lg:hidden"
          >
            <SidebarToggleIcon open={mobileOpen} />
          </button>
          <button
            type="button"
            aria-label={
              desktopExpanded ? "Tutup sidebar Admin" : "Buka sidebar Admin"
            }
            aria-expanded={desktopExpanded}
            aria-controls="admin-desktop-navigation"
            onClick={() => setDesktopExpanded((previous) => !previous)}
            className="hidden size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-bg focus-visible:outline-2 focus-visible:outline-brand lg:grid"
          >
            <SidebarToggleIcon open={desktopExpanded} />
          </button>
          <nav
            aria-label="Breadcrumb"
            className="min-w-0 flex-1 truncate text-[13px] text-[#60746a]"
          >
            Admin <span className="mx-2">/</span>{" "}
            <strong className="font-semibold text-ink">{pageName}</strong>
          </nav>
          <span
            className="hidden max-w-[200px] truncate rounded-md border border-line bg-white px-3 py-2 text-xs text-[#60766b] sm:block"
            title={organization}
          >
            {organization}
          </span>
          <div className="relative">
            <button
              type="button"
              aria-label="Buka notifikasi Admin"
              aria-haspopup="dialog"
              aria-expanded={notificationsOpen}
              onClick={() => void toggleNotifications()}
              className="grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-bg focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Glyph kind="bell" />
            </button>
            {notificationsOpen && (
              <div
                role="dialog"
                aria-label="Notifikasi administrasi"
                className="absolute right-0 top-full z-40 mt-2 w-[min(330px,85vw)] rounded-xl border border-line bg-white p-4 shadow-lg"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Notifikasi Admin</h2>
                  <button
                    type="button"
                    aria-label="Tutup notifikasi"
                    onClick={() => setNotificationsOpen(false)}
                    className="rounded p-1 text-muted hover:bg-bg"
                  >
                    <Glyph kind="close" className="size-4" />
                  </button>
                </div>
                {pendingApplications === null ? (
                  <p className="mt-3 text-xs text-muted">
                    Ringkasan belum tersedia. Periksa izin review_applications
                    dan MFA.
                  </p>
                ) : (
                  <p className="mt-3 text-sm">
                    {pendingApplications === 0
                      ? "Tidak ada permohonan baru yang menunggu peninjauan."
                      : `${pendingApplications} permohonan akses memerlukan tinjauan.`}
                  </p>
                )}
                <Link
                  href="/admin/access-applications"
                  onClick={() => setNotificationsOpen(false)}
                  className="mt-4 block rounded-md border border-line px-3 py-2 text-center text-xs font-semibold text-brand hover:bg-bg"
                >
                  Lihat permohonan akses
                </Link>
              </div>
            )}
          </div>
          <Link
            href="/account/security"
            aria-label="Profil dan keamanan Admin"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e8f5ee] text-xs font-semibold text-[#157253]"
          >
            AC
          </Link>
        </header>
        <main className="mx-auto w-full max-w-[1540px] px-4 py-7 sm:px-6 lg:px-7">
          {children}
        </main>
      </div>
    </div>
  );
}
