import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";

/** Optional local installation metadata. No exact coordinates or event location. */
export async function getApprovedListenInstallationLabels(
  organizationId: string,
  observationIds: string[],
): Promise<Map<string, string>> {
  const values = [...new Set(observationIds)].slice(0, 50);
  if (values.length === 0) return new Map();
  try {
    const rows = await getDb().execute<{
      observation_id: string;
      location_label: string;
    }>(sql`
      SELECT r.observation_id, l.location_label
      FROM ingestion_recordings r
      JOIN listen_device_installations l
        ON l.device_id = r.device_id
       AND l.organization_id = r.organization_id
      WHERE r.organization_id = ${organizationId}::uuid
        AND r.observation_id IN (${sql.join(
          values.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
        AND l.disclosure_approved = TRUE
      LIMIT 50
    `);
    return new Map(
      rows.rows.map((row) => [row.observation_id, row.location_label]),
    );
  } catch {
    // The installation table is a local optional migration in some worktrees.
    // Never invent coordinates, or block a Case when no installation is installed.
    return new Map();
  }
}
