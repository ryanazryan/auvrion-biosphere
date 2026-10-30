/** Only implemented, authorized destinations belong in the Admin sidebar. */
export type AdminNavigationIcon =
  | "grid"
  | "map"
  | "activity"
  | "cpu"
  | "plus"
  | "list"
  | "pin"
  | "clipboard"
  | "users"
  | "inbox"
  | "shield"
  | "settings";

export type AdminNavigationItem = {
  label: string;
  icon: AdminNavigationIcon;
  href: string;
};

export const ADMIN_NAVIGATION_SECTIONS: ReadonlyArray<{
  title: string;
  items: ReadonlyArray<AdminNavigationItem>;
}> = [
  {
    title: "OPERASI",
    items: [{ label: "Peta lingkungan", icon: "map", href: "/admin/map" }],
  },
  {
    title: "PERANGKAT",
    items: [{ label: "Perangkat IoT", icon: "cpu", href: "/admin/devices" }],
  },
  {
    title: "ADMINISTRASI",
    items: [
      {
        label: "Permohonan Akses",
        icon: "inbox",
        href: "/admin/access-applications",
      },
      {
        label: "Pengguna & Hak Akses",
        icon: "users",
        href: "/admin/access-users",
      },
      { label: "Keamanan", icon: "shield", href: "/account/security" },
    ],
  },
];
