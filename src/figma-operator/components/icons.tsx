"use client";

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const Eye = (p: P) => (
  <svg {...base(p)}>
    <title>Eye</title>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const EyeOff = (p: P) => (
  <svg {...base(p)}>
    <title>EyeOff</title>
    <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);
export const Alert = (p: P) => (
  <svg {...base(p)}>
    <title>Alert</title>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4.5M12 16h.01" />
  </svg>
);
export const Check = (p: P) => (
  <svg {...base(p)}>
    <title>Check</title>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const Info = (p: P) => (
  <svg {...base(p)}>
    <title>Info</title>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);
export const Lock = (p: P) => (
  <svg {...base(p)}>
    <title>Lock</title>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);
export const Shield = (p: P) => (
  <svg {...base(p)}>
    <title>Shield</title>
    <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.3-7.5 9.5-4.3-1.2-7.5-5-7.5-9.5V6L12 3Z" />
  </svg>
);
export const ArrowLeft = (p: P) => (
  <svg {...base(p)}>
    <title>ArrowLeft</title>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
export const Copy = (p: P) => (
  <svg {...base(p)}>
    <title>Copy</title>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
    <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
  </svg>
);
export const Download = (p: P) => (
  <svg {...base(p)}>
    <title>Download</title>
    <path d="M12 4v11M7 10.5l5 5 5-5M4.5 20h15" />
  </svg>
);
export const Monitor = (p: P) => (
  <svg {...base(p)}>
    <title>Monitor</title>
    <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
    <path d="M8.5 20h7M12 16.5V20" />
  </svg>
);
export const Phone = (p: P) => (
  <svg {...base(p)}>
    <title>Phone</title>
    <rect x="6.5" y="3" width="11" height="18" rx="2" />
    <path d="M11 17.5h2" />
  </svg>
);
export const Clock = (p: P) => (
  <svg {...base(p)}>
    <title>Clock</title>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const Mail = (p: P) => (
  <svg {...base(p)}>
    <title>Mail</title>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 6.5 12 13l8.5-6.5" />
  </svg>
);
export const Ban = (p: P) => (
  <svg {...base(p)}>
    <title>Ban</title>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </svg>
);
export const Flask = (p: P) => (
  <svg {...base(p)}>
    <title>Flask</title>
    <path d="M9.5 3.5h5M10 3.5v6L4.8 18.3A1.5 1.5 0 0 0 6.1 20.5h11.8a1.5 1.5 0 0 0 1.3-2.2L14 9.5v-6" />
    <path d="M7.5 14.5h9" />
  </svg>
);
export const Search = (p: P) => (
  <svg {...base(p)}>
    <title>Search</title>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);
export const Users = (p: P) => (
  <svg {...base(p)}>
    <title>Users</title>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 5.3a3.5 3.5 0 0 1 0 6.4M18 14.3c2 .8 3.5 2.6 3.5 5.7" />
  </svg>
);
export const ArrowRight = (p: P) => (
  <svg {...base(p)}>
    <title>ArrowRight</title>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const UserPlus = (p: P) => (
  <svg {...base(p)}>
    <title>UserPlus</title>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3 20c0-3.6 2.9-6 6.5-6 1.5 0 2.8.4 3.9 1.1M18 14v6M15 17h6" />
  </svg>
);
export const Inbox = (p: P) => (
  <svg {...base(p)}>
    <title>Inbox</title>
    <path d="M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
    <path d="M3 13h5l1 2.5h6l1-2.5h5" />
  </svg>
);
export const List = (p: P) => (
  <svg {...base(p)}>
    <title>List</title>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);
export const Bell = (p: P) => (
  <svg {...base(p)}>
    <title>Bell</title>
    <path d="M6 17.5V11a6 6 0 0 1 12 0v6.5l1.5 1.5h-15L6 17.5ZM10 21h4" />
  </svg>
);
export const Menu = (p: P) => (
  <svg {...base(p)}>
    <title>Menu</title>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
export const X = (p: P) => (
  <svg {...base(p)}>
    <title>X</title>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const Chevron = (p: P) => (
  <svg {...base(p)}>
    <title>Chevron</title>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const LogOut = (p: P) => (
  <svg {...base(p)}>
    <title>LogOut</title>
    <path d="M14 4.5H7A1.5 1.5 0 0 0 5.5 6v12A1.5 1.5 0 0 0 7 19.5h7M10 12h10M16.5 8.5 20 12l-3.5 3.5" />
  </svg>
);
export const Grid = (p: P) => (
  <svg {...base(p)}>
    <title>Grid</title>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
  </svg>
);
export const Gear = (p: P) => (
  <svg {...base(p)}>
    <title>Gear</title>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
  </svg>
);
export const Leaf = (p: P) => (
  <svg {...base(p)}>
    <title>Leaf</title>
    <path d="M5 19c0-8 5-13.5 14-14-.5 9-6 14-14 14Z" />
    <path d="M5 19l7-7" />
  </svg>
);
export const Gauge = (p: P) => (
  <svg {...base(p)}>
    <title>Gauge</title>
    <path d="M4 16a8 8 0 1 1 16 0" />
    <path d="M12 16l3.5-4.5M4 19.5h16" />
  </svg>
);
export const Plus = (p: P) => (
  <svg {...base(p)}>
    <title>Plus</title>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const MapPin = (p: P) => (
  <svg {...base(p)}>
    <title>MapPin</title>
    <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);
export const Route = (p: P) => (
  <svg {...base(p)}>
    <title>Route</title>
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="6" r="2" />
    <path d="M8 18h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16" />
  </svg>
);
export const Trash = (p: P) => (
  <svg {...base(p)}>
    <title>Trash</title>
    <path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5h9l1-12.5M9.5 7V4.5h5V7" />
  </svg>
);
