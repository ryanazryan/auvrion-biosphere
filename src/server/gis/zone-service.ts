import "server-only";

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { operationalZones } from "@/server/db/operations-domain-schema";

/** Names only until a separate, audited geometry-disclosure policy is approved. */
export async function listScopedZones(organizationId: string) {
  const rows = await getDb()
    .select({
      id: operationalZones.id,
      code: operationalZones.code,
      name: operationalZones.name,
    })
    .from(operationalZones)
    .where(eq(operationalZones.organizationId, organizationId))
    .orderBy(asc(operationalZones.name))
    .limit(200);

  return rows.map((zone) => ({ ...zone, geometry: null }));
}
