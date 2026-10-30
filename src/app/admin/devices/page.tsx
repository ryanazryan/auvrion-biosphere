import { DeviceAdminFrame } from "@/components/admin/DeviceAdminFrame";
import { DeviceFleetPanel } from "@/components/admin/DeviceFleetPanel";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Perangkat IoT | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

export default function DeviceIndexPage() {
  return (
    <DeviceAdminFrame pageName="Perangkat IoT">
      <DeviceFleetPanel />
    </DeviceAdminFrame>
  );
}
