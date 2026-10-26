import "maplibre-gl/dist/maplibre-gl.css";
import { SharedEnvironmentMap } from "@/components/gis/SharedEnvironmentMap";
import { findWorkspaceAccess } from "@/server/workflow/workspace-queries";

export const dynamic = "force-dynamic";

export default async function SupervisorMapPage() {
  const access = await findWorkspaceAccess("supervisor");
  if (!access.allowed) return null;
  return (
    <SharedEnvironmentMap
      organizationId={access.organizationId}
      workspaceRole="supervisor"
    />
  );
}
