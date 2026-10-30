import { DeviceAdminFrame } from "@/components/admin/DeviceAdminFrame";
import { DeviceDetailPanel } from "@/components/admin/DeviceDetailPanel";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Detail Perangkat IoT | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <DeviceAdminFrame pageName="Detail Perangkat">
      <DeviceDetailPanel deviceId={id} />
    </DeviceAdminFrame>
  );
}
