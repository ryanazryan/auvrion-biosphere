import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

const base = (props: Props) => ({
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
  ...props,
});

export const MenuIcon = (p: Props) => (
  <svg {...base(p)}>
    <title>Menu</title>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const CloseIcon = (p: Props) => (
  <svg {...base(p)}>
    <title>Tutup</title>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const GridIcon = (p: Props) => (
  <svg {...base(p)}>
    <title>Ringkasan</title>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
  </svg>
);

export const InboxIcon = (p: Props) => (
  <svg {...base(p)}>
    <title>Permohonan akses</title>
    <path d="M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
    <path d="M3 13h5l1 2.5h6l1-2.5h5" />
  </svg>
);

export const UsersIcon = (p: Props) => (
  <svg {...base(p)}>
    <title>Pengguna dan hak akses</title>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 5.3a3.5 3.5 0 0 1 0 6.4M18 14.3c2 .8 3.5 2.6 3.5 5.7" />
  </svg>
);

export const ShieldIcon = (p: Props) => (
  <svg {...base(p)}>
    <title>Keamanan</title>
    <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.3-7.5 9.5-4.3-1.2-7.5-5-7.5-9.5V6L12 3Z" />
  </svg>
);

export const GearIcon = (p: Props) => (
  <svg {...base(p)}>
    <title>Pengaturan</title>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
  </svg>
);

export const BellIcon = (p: Props) => (
  <svg {...base(p)}>
    <title>Notifikasi</title>
    <path d="M6 17.5V11a6 6 0 0 1 12 0v6.5l1.5 1.5h-15L6 17.5ZM10 21h4" />
  </svg>
);

export const LogoutIcon = (p: Props) => (
  <svg {...base(p)}>
    <title>Logout</title>
    <path d="M14 4.5H7A1.5 1.5 0 0 0 5.5 6v12A1.5 1.5 0 0 0 7 19.5h7M10 12h10M16.5 8.5 20 12l-3.5 3.5" />
  </svg>
);

export const SearchIcon = (p: Props) => (
  <svg {...base(p)}>
    <title>Cari</title>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);

export function AuvrionMark({ className }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      role="img"
      aria-label="Auvrion Biosphere"
      className={className}
    >
      <title>Auvrion Biosphere</title>
      <circle
        cx="12"
        cy="12"
        r="10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M12 4.5c-3.5 3-4.8 6.6-3.6 10.5M12 4.5c3.5 3 4.8 6.6 3.6 10.5M12 4.5v15"
        fill="none"
        stroke="#8fc9b2"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
