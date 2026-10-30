import { notFound } from "next/navigation";
import { ListenDemoObservation } from "@/figma-operator/demo/ListenDemoObservation";
import { ObservationDetail } from "@/figma-operator/screens/operator/ObservationDetail";
export default async function OperatorObservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (id === "demo-listen-01") {
    if (process.env.NODE_ENV !== "development") notFound();
    return <ListenDemoObservation />;
  }
  return <ObservationDetail id={id} />;
}
