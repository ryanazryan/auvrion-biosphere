import { ObservationDetail } from "@/figma-operator/screens/operator/ObservationDetail";
export default async function OperatorObservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ObservationDetail id={id} />;
}
