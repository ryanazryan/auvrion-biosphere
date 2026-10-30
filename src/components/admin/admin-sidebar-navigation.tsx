"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  ADMIN_NAVIGATION_SECTIONS,
  type AdminNavigationIcon,
} from "@/components/admin/admin-navigation-config";

function SidebarIcon({
  name,
  className,
}: {
  name: AdminNavigationIcon;
  className?: string;
}) {
  const paths: Record<AdminNavigationIcon, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.4" />
        <rect x="14" y="3" width="7" height="7" rx="1.4" />
        <rect x="3" y="14" width="7" height="7" rx="1.4" />
        <rect x="14" y="14" width="7" height="7" rx="1.4" />
      </>
    ),
    map: (
      <>
        <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z" />
        <path d="M9 3v16M15 5v16" />
      </>
    ),
    activity: (
      <>
        <path d="M3 17V7M7 17v-6M11 17V4M15 17v-8M19 17v-4" />
      </>
    ),
    cpu: (
      <>
        <rect x="5" y="5" width="14" height="14" rx="2" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
        <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
      </>
    ),
    plus: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
    list: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M8 9h10M8 14h10M5.7 9h.1M5.7 14h.1" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.7" />
      </>
    ),
    clipboard: (
      <>
        <rect x="5" y="5" width="14" height="17" rx="2" />
        <path d="M9 5V3h6v2M9 11h6M9 15h6" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 15c2 .5 4 2 4 5" />
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
        <path d="m12 2 9 4v6c0 5-3.6 8.6-9 10-5.4-1.4-9-5-9-10V6l9-4Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.65"
      className={className ?? "size-4.5 shrink-0"}
    >
      {paths[name]}
    </svg>
  );
}

export function AdminSidebarNavigation({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi administrasi"
      className="flex-1 overflow-y-auto px-3 py-4"
    >
      {ADMIN_NAVIGATION_SECTIONS.map((section) => (
        <section
          key={section.title}
          aria-label={section.title}
          className="mb-5"
        >
          <h2 className="mb-2 px-3 text-[10px] font-bold tracking-[0.12em] text-[#74847b]">
            {section.title}
          </h2>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = item.href === pathname;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#20785f] ${active ? "bg-[#e9f4ef] font-semibold text-[#126c52]" : "text-[#51645b] hover:bg-[#f0f5f1] hover:text-[#142d25]"}`}
                >
                  <SidebarIcon name={item.icon} />
                  <span className="min-w-0 flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}
