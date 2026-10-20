import "maplibre-gl/dist/maplibre-gl.css";
import { Suspense } from "react";
import { GisWorkspace } from "@/figma-operator/screens/operator/GisWorkspace";

export default function OperatorGisPage() {
  return (
    <Suspense
      fallback={
        <main className="p-6 text-sm text-muted">Memuat workspace GIS…</main>
      }
    >
      <GisWorkspace />
    </Suspense>
  );
}
