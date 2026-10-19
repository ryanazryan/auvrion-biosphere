import { Suspense } from "react";
import { Observations } from "@/figma-operator/screens/operator/Observations";
export default function OperatorObservationListPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8 text-sm text-muted">Memuat observasi...</main>
      }
    >
      <Observations />
    </Suspense>
  );
}
