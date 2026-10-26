import "maplibre-gl/dist/maplibre-gl.css";
import { SharedEnvironmentMap } from "@/components/gis/SharedEnvironmentMap";
import { findRangerWorkspaceAccess } from "@/server/ranger/ranger-workspace";

export const dynamic = "force-dynamic";

export default async function RangerMapPage() {
  const access = await findRangerWorkspaceAccess();
  if (!access.allowed) return null;
  return (
    <SharedEnvironmentMap
      organizationId={access.organizationId}
      workspaceRole="ranger"
    />
  );
}
