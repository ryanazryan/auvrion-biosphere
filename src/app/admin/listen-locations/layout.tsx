import type { ReactNode } from "react";
import { DeviceAdminFrame } from "@/components/admin/DeviceAdminFrame";

export default function ListenLocationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DeviceAdminFrame pageName="Lokasi pemasangan">{children}</DeviceAdminFrame>
  );
}
