import { notFound } from "next/navigation";
import { ListenWorkspace } from "@/figma-operator/screens/operator/ListenWorkspace";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ListenDevicePage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  if (!UUID.test(deviceId)) notFound();
  return <ListenWorkspace deviceId={deviceId} />;
}
