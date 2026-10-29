"use client";

import { useState } from "react";
import { MapLocationControls } from "@/components/gis/MapLocationControls";
import type { MapNavigationTarget } from "@/components/gis/map-navigation";
import type { GisRecord } from "@/figma-operator/gis/client";
import { GisMapCanvas } from "@/figma-operator/screens/operator/GisMapCanvas";

const NO_OBSERVATIONS: GisRecord[] = [];

/** Admin local read-only navigation map. No implicit access to private observations. */
export function AdminLocationMap({
  organizationId,
}: {
  organizationId: string;
}) {
  const [navigationTarget, setNavigationTarget] =
    useState<MapNavigationTarget | null>(null);
  return (
    <section aria-label="Peta pencarian lokasi admin" className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold text-ink">Peta Lokasi</h1>
      </div>
      <div className="relative h-[min(68vh,700px)] min-h-[450px] overflow-hidden rounded-xl border border-line bg-bg">
        <GisMapCanvas
          rows={NO_OBSERVATIONS}
          selected={null}
          onSelect={() => undefined}
          navigationTarget={navigationTarget}
        />
        <MapLocationControls
          organizationId={organizationId}
          onNavigate={setNavigationTarget}
        />
      </div>
    </section>
  );
}
