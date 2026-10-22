import type { ReactNode, SVGProps } from "react";

type IconName =
  | "brand"
  | "home"
  | "route"
  | "notebook"
  | "clock"
  | "shield"
  | "logout"
  | "chevron"
  | "chevron-left"
  | "search"
  | "map-pin"
  | "alert"
  | "check"
  | "user"
  | "calendar"
  | "file"
  | "menu"
  | "lock"
  | "inbox";

export function RangerIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  if (name === "brand") {
    return (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
        <circle
          cx="16"
          cy="16"
          r="14"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M16 7c-3 3-6 6-6 11a6 6 0 0 0 12 0c0-5-3-8-6-11Z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M16 13v12"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  const shapes: Record<Exclude<IconName, "brand">, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
      </>
    ),
    route: (
      <>
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M8 18h7a4 4 0 0 0 0-8H9a3 3 0 0 1 0-6h6" />
      </>
    ),
    notebook: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 3v18M11 8h6M11 12h6M11 16h4" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    shield: <path d="M12 2 4.5 5v6c0 5 3 8.5 7.5 11 4.5-2.5 7.5-6 7.5-11V5z" />,
    logout: (
      <>
        <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
        <path d="m14 8 4 4-4 4M18 12H8" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    "chevron-left": <path d="m15 18-6-6 6-6" />,
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
    "map-pin": (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    alert: (
      <>
        <path d="m12 3 10 18H2z" />
        <path d="M12 9v5m0 3h.01" />
      </>
    ),
    check: <path d="m4 12 5 5L20 6" />,
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
      </>
    ),
    file: (
      <>
        <path d="M13 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10Z" />
        <path d="M13 2v8h8M7 15h10M7 18h7" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="12" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    inbox: (
      <>
        <path d="m4 4-2 11v5h20v-5L20 4z" />
        <path d="M2 15h6l2 3h4l2-3h6" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {shapes[name]}
    </svg>
  );
}
